import { getIssueKeyFromValue, getIssueLabel } from "../issues";
import {
  STRUCTURED_EVENT_ISSUE_TAGS,
  STRUCTURED_EVENT_REGIONS,
} from "./structured-event-options";
import type { StructuredEventResult } from "./structured-event";

type StructuredExtractionPayloadSummary = {
  status: string | null;
  incompleteReason: string | null;
  outputTypes: string[];
  contentTypes: string[];
};

export class StructuredExtractionOutputError extends Error {
  constructor(
    readonly model: string,
    readonly summary: StructuredExtractionPayloadSummary,
  ) {
    super(formatStructuredOutputErrorMessage(model, summary));
  }
}

export function sanitizeStructuredEventResult(
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

export function parseStructuredOutput(
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
    ? (payload as { output: unknown[] }).output
    : [];
  const outputTypes = output
    .map((item) =>
      item && typeof item === "object" ? readStringProperty(item, "type") : null,
    )
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
        part && typeof part === "object"
          ? readStringProperty(part, "type")
          : null,
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
