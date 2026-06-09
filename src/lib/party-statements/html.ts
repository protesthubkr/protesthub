import "server-only";

import { request as httpsRequest } from "https";

const USER_AGENT =
  "Mozilla/5.0 (compatible; ProtestHubBot/1.0; +https://protesthub.local)";

export async function fetchPartyStatementHtml({
  allowInsecureTls,
  url,
}: {
  allowInsecureTls?: boolean;
  url: string;
}) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    return response.text();
  } catch (error) {
    if (!allowInsecureTls || !isTlsCertificateError(error)) {
      throw error;
    }

    return fetchHtmlWithInsecureTls(url);
  }
}

export function absoluteUrl(href: string, baseUrl: string) {
  return new URL(decodeHtmlEntities(href), baseUrl).toString();
}

export function extractFirstMatch(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1] ?? "";
}

export function stripHtml(html: string) {
  return normalizeText(
    decodeHtmlEntities(
      html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

export function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, codepoint: string) =>
      String.fromCodePoint(Number.parseInt(codepoint, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, codepoint: string) =>
      String.fromCodePoint(Number.parseInt(codepoint, 16)),
    );
}

export function parseKoreanDateTime(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const dateTimeMatch = normalized.match(
    /(20\d{2})[-.\/년]\s*(\d{1,2})[-.\/월]\s*(\d{1,2})(?:일)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );

  if (!dateTimeMatch) {
    return null;
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0"] =
    dateTimeMatch;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(
    2,
    "0",
  )}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(
    2,
    "0",
  )}+09:00`;
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function mapPartyDocumentType(rawCategory: string) {
  const category = normalizeText(rawCategory);

  if (/^성명서?$/.test(category)) {
    return "statement" as const;
  }

  if (/^(논평|브리핑|서면브리핑)$/.test(category)) {
    return "commentary" as const;
  }

  if (/^기자회견문$/.test(category)) {
    return "press_conference" as const;
  }

  return null;
}

function isTlsCertificateError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const code = "code" in error.cause ? error.cause.code : null;

    return (
      code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      code === "SELF_SIGNED_CERT_IN_CHAIN" ||
      code === "CERT_HAS_EXPIRED"
    );
  }

  return false;
}

function fetchHtmlWithInsecureTls(url: string) {
  return new Promise<string>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        headers: {
          "user-agent": USER_AGENT,
        },
        rejectUnauthorized: false,
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          resolve(
            fetchHtmlWithInsecureTls(
              new URL(response.headers.location, url).toString(),
            ),
          );
          return;
        }

        if (!response.statusCode || response.statusCode >= 400) {
          reject(
            new Error(`Fetch failed with status ${response.statusCode ?? 0}`),
          );
          response.resume();
          return;
        }

        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve(body);
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}
