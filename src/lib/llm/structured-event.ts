import { buildStructuredEventPrompt } from "./structured-event-prompt";
import {
  getExtractionFallbackModel,
  getExtractionMaxOutputTokens,
  getExtractionModel,
  getReasoningRequestOptions,
} from "./structured-event-config";
import {
  parseStructuredOutput,
  sanitizeStructuredEventResult,
  StructuredExtractionOutputError,
} from "./structured-event-output";
import { STRUCTURED_EVENT_SCHEMA } from "./structured-event-schema";

export type StructuredEventExtractionInput = {
  sourceAccountName: string;
  sourcePostUrl: string;
  textSnapshot: string;
  ocrText: string;
  today: string;
};

export type StructuredEventDate = {
  date: string;
  start_time: string;
};

export type StructuredEventResult = {
  is_event: boolean;
  confidence: number;
  title: string;
  venue: string;
  address: string;
  region: string;
  organizers: string[];
  dates: StructuredEventDate[];
  issue_tags: string[];
  primary_issue: string;
  format: string;
  status_hint:
    | "publish_candidate"
    | "needs_review"
    | "ignore"
    | "canceled"
    | "duplicate_unknown";
  exclusion_reason: string;
  evidence: {
    title_source: string;
    date_source: string;
    place_source: string;
    issue_source: string;
  };
};

export type StructuredEventExtractionResult = {
  model: string;
  provider: "openai_responses";
  result: StructuredEventResult;
  fallback?: {
    fromModel: string;
    reasons: string[];
  };
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MIN_CONFIDENCE_FOR_PRIMARY_MODEL = 70;

export class StructuredExtractionConfigError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured.") {
    super(message);
  }
}

export class StructuredExtractionRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`OpenAI structured extraction failed with status ${status}`);
  }
}

export async function extractStructuredEvent(
  input: StructuredEventExtractionInput,
): Promise<StructuredEventExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new StructuredExtractionConfigError();
  }

  const model = getExtractionModel();
  const fallbackModel = getExtractionFallbackModel(model);
  let primaryExtraction: StructuredEventExtractionResult;

  try {
    primaryExtraction = await requestStructuredEvent(input, model, apiKey);
  } catch (error) {
    if (!fallbackModel || !isRetryableStructuredExtractionError(error)) {
      throw error;
    }

    return {
      ...(await requestStructuredEvent(input, fallbackModel, apiKey)),
      fallback: {
        fromModel: model,
        reasons: [`primary_error:${getErrorReason(error)}`],
      },
    };
  }

  const fallbackReasons = getFallbackReasons(input, primaryExtraction.result);

  if (!fallbackModel || fallbackReasons.length === 0) {
    return primaryExtraction;
  }

  return {
    ...(await requestStructuredEvent(input, fallbackModel, apiKey)),
    fallback: {
      fromModel: model,
      reasons: fallbackReasons,
    },
  };
}

async function requestStructuredEvent(
  input: StructuredEventExtractionInput,
  model: string,
  apiKey: string,
): Promise<StructuredEventExtractionResult> {
  const body = {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildStructuredEventPrompt(input),
          },
        ],
      },
    ],
    max_output_tokens: getExtractionMaxOutputTokens(),
    text: {
      format: {
        type: "json_schema",
        name: "protest_event_extraction",
        strict: true,
        schema: STRUCTURED_EVENT_SCHEMA,
      },
    },
    ...getReasoningRequestOptions(model),
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new StructuredExtractionRequestError(response.status, payload);
  }

  return {
    model,
    provider: "openai_responses",
    result: sanitizeStructuredEventResult(parseStructuredOutput(payload, model)),
  };
}

function getFallbackReasons(
  input: StructuredEventExtractionInput,
  result: StructuredEventResult,
) {
  const sourceText = `${input.textSnapshot}\n${input.ocrText}`;
  const hasDateKeyword = sourceText.includes("일시");
  const hasPlaceKeyword = sourceText.includes("장소");
  const reasons: string[] = [];

  if (result.confidence < MIN_CONFIDENCE_FOR_PRIMARY_MODEL) {
    reasons.push("low_confidence");
  }

  if (hasDateKeyword && result.dates.length === 0) {
    reasons.push("missing_date");
  }

  if (hasPlaceKeyword && !result.venue.trim()) {
    reasons.push("missing_venue");
  }

  if (hasDateKeyword && hasPlaceKeyword && !result.is_event) {
    reasons.push("source_has_date_place_but_not_event");
  }

  return reasons;
}

function isRetryableStructuredExtractionError(error: unknown) {
  return error instanceof StructuredExtractionOutputError;
}

function getErrorReason(error: unknown) {
  if (error instanceof StructuredExtractionOutputError) {
    return error.summary.incompleteReason ?? "no_output_text";
  }

  return error instanceof Error ? error.message : "unknown";
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
