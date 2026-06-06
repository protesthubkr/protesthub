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
  description: string;
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
  const primaryExtraction = await requestStructuredEvent(input, model, apiKey);
  const fallbackReasons = getFallbackReasons(input, primaryExtraction.result);
  const fallbackModel = getExtractionFallbackModel(model);

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
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
      max_output_tokens: 1800,
      text: {
        format: {
          type: "json_schema",
          name: "protest_event_extraction",
          strict: true,
          schema: STRUCTURED_EVENT_SCHEMA,
        },
      },
    }),
  });

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new StructuredExtractionRequestError(response.status, payload);
  }

  return {
    model,
    provider: "openai_responses",
    result: sanitizeStructuredEventResult(parseStructuredOutput(payload)),
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
    description: result.description.trim(),
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

function parseStructuredOutput(payload: unknown): StructuredEventResult {
  const text = readOutputText(payload);

  if (!text) {
    throw new Error("Structured extraction returned no output text.");
  }

  return JSON.parse(text) as StructuredEventResult;
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
