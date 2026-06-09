import "server-only";

import {
  analyzePastEventNotice,
  areAllDatesPast,
} from "@/lib/event-date-filter";
import {
  extractStructuredEvent,
  type StructuredEventResult,
} from "@/lib/llm/structured-event";
import {
  createStoredStructuredEvent,
  type StructuredEventInputMode,
} from "@/lib/structured-event-storage";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type CandidateStatus =
  | "needs_review"
  | "ignored"
  | "published"
  | "canceled"
  | "duplicate";

type CandidateForStructuredExtraction = {
  id: string;
  status: CandidateStatus;
  source_name: string;
  source_url: string;
  text_snapshot: string;
  ocr_text: string | null;
  extraction_payload: Record<string, unknown> | null;
  review_reason: string[];
};

export async function runStructuredExtractionForCandidate(
  candidateId: string,
  options: {
    inputMode?: StructuredEventInputMode;
  } = {},
) {
  const supabase = getSupabaseAdminClient();
  const inputMode = options.inputMode ?? "post_text_and_ocr";

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .select(
      [
        "id",
        "status",
        "source_name",
        "source_url",
        "text_snapshot",
        "ocr_text",
        "extraction_payload",
        "review_reason",
      ].join(","),
    )
    .eq("id", candidateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Candidate not found.");
  }

  const candidate = data as unknown as CandidateForStructuredExtraction;
  const ocrText = inputMode === "post_text_and_ocr" ? candidate.ocr_text ?? "" : "";
  const textForDateFilter = [candidate.text_snapshot, ocrText].join("\n");
  const textDateFilter = analyzePastEventNotice(textForDateFilter);
  const extraction = await extractStructuredEvent({
    sourceAccountName: candidate.source_name,
    sourcePostUrl: candidate.source_url,
    textSnapshot: candidate.text_snapshot,
    ocrText,
    today: textDateFilter.today,
  });
  const structuredEvent = extraction.result;
  const structuredDateKeys = structuredEvent.dates
    .map((date) => date.date)
    .filter(Boolean);
  const structuredDatesPast = areAllDatesPast(structuredDateKeys);
  const shouldIgnore =
    textDateFilter.ignoredAsPast ||
    structuredDatesPast ||
    (structuredEvent.status_hint === "ignore" &&
      !structuredEvent.is_event &&
      structuredEvent.confidence >= 70);
  const shouldMarkCanceled = structuredEvent.status_hint === "canceled";
  const now = new Date().toISOString();
  const nextStatus = getNextStatus(candidate.status, {
    shouldIgnore,
    shouldMarkCanceled,
  });
  const nextPayload = {
    ...removeRedundantStructuredPayload(candidate.extraction_payload ?? {}),
    structured_event: createStoredStructuredEvent({
      provider: extraction.provider,
      model: extraction.model,
      inputMode,
      ranAt: now,
      result: structuredEvent,
      dateAudit: {
        today: textDateFilter.today,
        detected_text_dates: textDateFilter.detectedDates,
        text_dates_past: textDateFilter.ignoredAsPast,
        result_dates_past: structuredDatesPast,
      },
    }),
  };
  const nextReasons = replaceStructuredEventReasons(candidate.review_reason, [
    ...getStructuredEventReasons(structuredEvent, inputMode, extraction),
    ...(textDateFilter.ignoredAsPast || structuredDatesPast
      ? ["past_event_date"]
      : []),
  ]);

  const { error: updateError } = await supabase
    .from("review_candidates")
    .update({
      status: nextStatus,
      extraction_payload: nextPayload,
      review_reason: nextReasons,
      updated_at: now,
    })
    .eq("id", candidateId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    candidateId,
    status: nextStatus,
    structuredEvent,
  };
}

function getNextStatus(
  currentStatus: CandidateStatus,
  decision: {
    shouldIgnore: boolean;
    shouldMarkCanceled: boolean;
  },
): CandidateStatus {
  if (currentStatus !== "needs_review") {
    return currentStatus;
  }

  if (decision.shouldIgnore) {
    return "ignored";
  }

  if (decision.shouldMarkCanceled) {
    return "canceled";
  }

  return currentStatus;
}

function getStructuredEventReasons(
  result: StructuredEventResult,
  inputMode: StructuredEventInputMode,
  extraction: Awaited<ReturnType<typeof extractStructuredEvent>>,
) {
  const reasons = ["llm_structured_extracted", `llm_input:${inputMode}`];

  if (result.is_event) {
    reasons.push("llm_event_candidate");
  } else {
    reasons.push("llm_not_event");
  }

  if (result.status_hint) {
    reasons.push(`llm_status:${result.status_hint}`);
  }

  if (extraction.fallback) {
    reasons.push(
      `llm_fallback_from:${extraction.fallback.fromModel}`,
      `llm_fallback_to:${extraction.model}`,
      ...extraction.fallback.reasons.map(
        (reason) => `llm_fallback_reason:${reason}`,
      ),
    );
  }

  return reasons;
}

function replaceStructuredEventReasons(
  currentReasons: string[],
  nextReasons: string[],
) {
  return Array.from(
    new Set([
      ...currentReasons.filter((reason) => !isStructuredEventReason(reason)),
      ...nextReasons,
    ]),
  );
}

function isStructuredEventReason(reason: string) {
  return (
    reason === "llm_structured_extracted" ||
    reason === "llm_event_candidate" ||
    reason === "llm_not_event" ||
    reason === "llm_has_date" ||
    reason === "llm_has_place" ||
    reason.startsWith("llm_input:") ||
    reason.startsWith("llm_status:") ||
    reason.startsWith("llm_fallback_from:") ||
    reason.startsWith("llm_fallback_to:") ||
    reason.startsWith("llm_fallback_reason:") ||
    reason.startsWith("llm_issue:")
  );
}

function removeRedundantStructuredPayload(payload: Record<string, unknown>) {
  const rest = { ...payload };
  delete rest.event_date_filter;
  delete rest.structured_event;

  return rest;
}
