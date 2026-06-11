const X_API_DEFAULT_MAX_RETRIES = 2;
const X_API_DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const X_API_MAX_RETRY_DELAY_MS = 8000;
const X_API_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class XApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
    readonly attempts = 1,
  ) {
    super(
      attempts > 1
        ? `X API request failed with status ${status} after ${attempts} attempts`
        : `X API request failed with status ${status}`,
    );
  }
}

export async function fetchX<T>(url: URL, bearerToken: string): Promise<T> {
  const maxRetries = getXApiMaxRetries();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (error) {
      if (attempt < maxRetries) {
        await delay(getXApiRetryDelayMs({ attempt }));
        continue;
      }

      throw error;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (attempt < maxRetries && isRetryableXApiResponse(response)) {
      await drainResponse(response);
      await delay(getXApiRetryDelayMs({ attempt, response }));
      continue;
    }

    throw new XApiError(
      response.status,
      await readJsonSafely(response),
      attempt + 1,
    );
  }

  throw new Error("X API request retry loop exited unexpectedly.");
}

async function readJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isRetryableXApiResponse(response: Response) {
  return X_API_RETRYABLE_STATUSES.has(response.status);
}

function getXApiMaxRetries() {
  return readBoundedIntegerEnv("X_API_MAX_RETRIES", {
    defaultValue: X_API_DEFAULT_MAX_RETRIES,
    max: 5,
    min: 0,
  });
}

function getXApiRetryBaseDelayMs() {
  return readBoundedIntegerEnv("X_API_RETRY_BASE_DELAY_MS", {
    defaultValue: X_API_DEFAULT_RETRY_BASE_DELAY_MS,
    max: X_API_MAX_RETRY_DELAY_MS,
    min: 100,
  });
}

function getXApiRetryDelayMs({
  attempt,
  response,
}: {
  attempt: number;
  response?: Response;
}) {
  const retryAfterMs = parseRetryAfterMs(response?.headers.get("retry-after"));

  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, X_API_MAX_RETRY_DELAY_MS);
  }

  const exponentialDelay = getXApiRetryBaseDelayMs() * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);

  return Math.min(exponentialDelay + jitter, X_API_MAX_RETRY_DELAY_MS);
}

function parseRetryAfterMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const seconds = Number.parseInt(value, 10);

  if (Number.isFinite(seconds)) {
    return Math.max(seconds * 1000, 0);
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(timestamp - Date.now(), 0);
}

function readBoundedIntegerEnv(
  key: string,
  {
    defaultValue,
    max,
    min,
  }: {
    defaultValue: number;
    max: number;
    min: number;
  },
) {
  const value = Number.parseInt(process.env[key] ?? "", 10);

  if (!Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.min(Math.max(value, min), max);
}

async function drainResponse(response: Response) {
  try {
    await response.text();
  } catch {
    // Best effort: the next retry does not depend on reading an error body.
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
