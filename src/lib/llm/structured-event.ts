import { buildStructuredEventPrompt } from "./structured-event-prompt";
import { getIssueKeyFromValue, getIssueLabel } from "../issues";
import {
  STRUCTURED_EVENT_ISSUE_TAGS,
  STRUCTURED_EVENT_REGIONS,
} from "./structured-event-options";
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
const DEFAULT_EXTRACTION_MODEL = "gpt-5-nano";
const DEFAULT_EXTRACTION_FALLBACK_MODEL = "gpt-5-mini";
const DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS = 6000;
const DEFAULT_EXTRACTION_REASONING_EFFORT = "minimal";
const MIN_CONFIDENCE_FOR_PRIMARY_MODEL = 70;
const REASONING_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

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

export class StructuredExtractionOutputError extends Error {
  constructor(
    readonly model: string,
    readonly summary: StructuredExtractionPayloadSummary,
  ) {
    super(formatStructuredOutputErrorMessage(model, summary));
  }
}

type StructuredExtractionPayloadSummary = {
  status: string | null;
  incompleteReason: string | null;
  outputTypes: string[];
  contentTypes: string[];
};

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

function getExtractionModel() {
  return process.env.OPENAI_EXTRACTION_MODEL?.trim() || DEFAULT_EXTRACTION_MODEL;
}

function getExtractionFallbackModel(primaryModel: string) {
  const rawValue = process.env.OPENAI_EXTRACTION_FALLBACK_MODEL;
  const fallbackModel =
    rawValue === undefined
      ? DEFAULT_EXTRACTION_FALLBACK_MODEL
      : rawValue.trim();

  if (!fallbackModel || fallbackModel === primaryModel) {
    return null;
  }

  return fallbackModel;
}

function getExtractionMaxOutputTokens() {
  const value = process.env.OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS;

  if (!value) {
    return DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS;
  }

  return Math.min(Math.max(parsed, 2000), 30000);
}

function getReasoningRequestOptions(model: string) {
  if (!isReasoningModel(model)) {
    return {};
  }

  const configuredEffort = process.env.OPENAI_EXTRACTION_REASONING_EFFORT
    ?.trim()
    .toLowerCase();
  const effort = configuredEffort || DEFAULT_EXTRACTION_REASONING_EFFORT;

  if (!REASONING_EFFORTS.has(effort)) {
    return {
      reasoning: {
        effort: DEFAULT_EXTRACTION_REASONING_EFFORT,
      },
    };
  }

  if (effort === "none" && !model.startsWith("gpt-5.1")) {
    return {
      reasoning: {
        effort: DEFAULT_EXTRACTION_REASONING_EFFORT,
      },
    };
  }

  return {
    reasoning: {
      effort,
    },
  };
}

function isReasoningModel(model: string) {
  return model.startsWith("gpt-5") || /^o\d/.test(model);
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

function sanitizeStructuredEventResult(
  result: StructuredEventResult,
): StructuredEventResult {
  const issueTags = Array.from(
    new Set(
      result.issue_tags
        .map(normalizeIssueTag)
        .filter((tag) => STRUCTURED_EVENT_ISSUE_TAGS.includes(tag)),
    ),
  );
  const primaryIssue = normalizeIssueTag(result.primary_issue);
  const place = normalizePlaceFields({
    venue: result.venue.trim(),
    address: result.address.trim(),
  });

  return {
    ...result,
    confidence: Math.min(Math.max(Math.round(result.confidence), 0), 100),
    title: result.title.trim(),
    venue: place.venue,
    address: place.address,
    organizers: result.organizers.map((item) => item.trim()).filter(Boolean),
    dates: result.dates
      .map((date) => ({
        date: date.date.trim(),
        start_time: date.start_time.trim(),
      }))
      .filter((date) => date.date),
    issue_tags: issueTags,
    primary_issue: STRUCTURED_EVENT_ISSUE_TAGS.includes(primaryIssue)
      ? primaryIssue
      : "",
  };
}

function normalizeIssueTag(value: string) {
  const issueKey = getIssueKeyFromValue(value);

  return issueKey ? getIssueLabel(issueKey) : value.trim();
}

function normalizePlaceFields({
  venue,
  address,
}: {
  venue: string;
  address: string;
}) {
  const addressWithoutRegion = stripLeadingRegion(address);

  if (
    address &&
    addressWithoutRegion &&
    venue.startsWith(addressWithoutRegion) &&
    venue.length > addressWithoutRegion.length
  ) {
    return {
      venue: address,
      address: venue.slice(addressWithoutRegion.length).trim(),
    };
  }

  if (venue && !address) {
    const split = splitTrailingLandmark(venue);

    if (split) {
      return split;
    }
  }

  return { venue, address };
}

function stripLeadingRegion(value: string) {
  const region = STRUCTURED_EVENT_REGIONS.filter(Boolean).find((item) =>
    value.startsWith(`${item} `),
  );

  return region ? value.slice(region.length).trim() : value;
}

function splitTrailingLandmark(value: string) {
  const frontPlaceMatch = value.match(/^(.+?\s앞)\s+(.+)$/);

  if (!frontPlaceMatch) {
    return null;
  }

  return {
    venue: frontPlaceMatch[1].trim(),
    address: frontPlaceMatch[2].trim(),
  };
}

function parseStructuredOutput(
  payload: unknown,
  model: string,
): StructuredEventResult {
  const text = readOutputText(payload);

  if (!text) {
    throw new StructuredExtractionOutputError(
      model,
      summarizeStructuredPayload(payload),
    );
  }

  return JSON.parse(text) as StructuredEventResult;
}

function summarizeStructuredPayload(
  payload: unknown,
): StructuredExtractionPayloadSummary {
  if (!payload || typeof payload !== "object") {
    return {
      status: null,
      incompleteReason: null,
      outputTypes: [],
      contentTypes: [],
    };
  }

  const status = readStringProperty(payload, "status");
  const incompleteDetails = readObjectProperty(payload, "incomplete_details");
  const incompleteReason = incompleteDetails
    ? readStringProperty(incompleteDetails, "reason")
    : null;
  const output = Array.isArray((payload as { output?: unknown }).output)
    ? ((payload as { output: unknown[] }).output)
    : [];
  const outputTypes = output
    .map((item) => (item && typeof item === "object" ? readStringProperty(item, "type") : null))
    .filter((type): type is string => Boolean(type));
  const contentTypes = output.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const content = (item as { content?: unknown }).content;

    if (!Array.isArray(content)) {
      return [];
    }

    return content
      .map((part) =>
        part && typeof part === "object" ? readStringProperty(part, "type") : null,
      )
      .filter((type): type is string => Boolean(type));
  });

  return {
    status,
    incompleteReason,
    outputTypes,
    contentTypes,
  };
}

function readObjectProperty(
  value: object,
  key: string,
): Record<string, unknown> | null {
  if (!(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return property && typeof property === "object"
    ? (property as Record<string, unknown>)
    : null;
}

function readStringProperty(value: object, key: string) {
  if (!(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" ? property : null;
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

function formatStructuredOutputErrorMessage(
  model: string,
  summary: StructuredExtractionPayloadSummary,
) {
  const details = [
    summary.status ? `status=${summary.status}` : null,
    summary.incompleteReason
      ? `incomplete_reason=${summary.incompleteReason}`
      : null,
    summary.outputTypes.length
      ? `output_types=${summary.outputTypes.join(",")}`
      : null,
    summary.contentTypes.length
      ? `content_types=${summary.contentTypes.join(",")}`
      : null,
  ].filter(Boolean);

  return [
    `Structured extraction returned no output text from ${model}.`,
    ...details,
  ].join(" ");
}

function readOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return [];
      }

      const content = item.content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => {
        if (!part || typeof part !== "object") {
          return [];
        }

        if ("text" in part && typeof part.text === "string") {
          return [part.text];
        }

        return [];
      });
    })
    .join("")
    .trim();
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
