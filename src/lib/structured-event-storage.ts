import type { StructuredEventResult } from "@/lib/llm/structured-event";

export type StructuredEventInputMode =
  | "post_text_and_ocr"
  | "post_text_only";

type StructuredEventDateAudit = {
  today: string;
  detected_text_dates: string[];
  text_dates_past: boolean;
  result_dates_past: boolean;
};

type StoredStructuredEvent = StructuredEventResult & {
  schema_version: 3;
  provider: "openai_responses";
  model: string;
  input_mode: StructuredEventInputMode;
  ran_at: string;
  date_audit: StructuredEventDateAudit;
};

type CreateStoredStructuredEventInput = {
  provider: "openai_responses";
  model: string;
  inputMode: StructuredEventInputMode;
  ranAt: string;
  result: StructuredEventResult;
  dateAudit: StructuredEventDateAudit;
};

export function createStoredStructuredEvent({
  provider,
  model,
  inputMode,
  ranAt,
  result,
  dateAudit,
}: CreateStoredStructuredEventInput): StoredStructuredEvent {
  return {
    schema_version: 3,
    provider,
    model,
    input_mode: inputMode,
    ran_at: ranAt,
    date_audit: dateAudit,
    ...compactStructuredEventResult(result),
  };
}

function compactStructuredEventResult(
  result: StructuredEventResult,
): StructuredEventResult {
  return {
    ...result,
    title: compactText(result.title, 120),
    venue: compactText(result.venue, 120),
    address: compactText(result.address, 160),
    region: result.region,
    organizers: result.organizers.map((item) => compactText(item, 80)),
    dates: result.dates,
    issue_tags: result.issue_tags,
    primary_issue: result.primary_issue,
    format: result.format,
    status_hint: result.status_hint,
    exclusion_reason: compactText(result.exclusion_reason, 180),
    evidence: {
      title_source: compactText(result.evidence.title_source, 120),
      date_source: compactText(result.evidence.date_source, 120),
      place_source: compactText(result.evidence.place_source, 120),
      issue_source: compactText(result.evidence.issue_source, 120),
    },
  };
}

export function getStoredStructuredEvent(
  extractionPayload: Record<string, unknown> | null | undefined,
) {
  const structuredEvent = extractionPayload?.structured_event;

  if (!structuredEvent || typeof structuredEvent !== "object") {
    return null;
  }

  if ("schema_version" in structuredEvent && structuredEvent.schema_version === 3) {
    return structuredEvent as unknown as StoredStructuredEvent;
  }

  return null;
}

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength - 1).trimEnd();
}
