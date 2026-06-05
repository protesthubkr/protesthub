import type { StructuredEventResult } from "@/lib/llm/structured-event";
import {
  getStoredStructuredEventInputMode,
  getStoredStructuredEventResult,
  type StructuredEventInputMode,
} from "@/lib/structured-event-storage";

export type { StructuredEventResult };

export function getCandidateStructuredEvent(
  extractionPayload: Record<string, unknown>,
): StructuredEventResult | null {
  return getStoredStructuredEventResult(extractionPayload);
}

export function getCandidateStructuredInputMode(
  extractionPayload: Record<string, unknown>,
): StructuredEventInputMode | null {
  return getStoredStructuredEventInputMode(extractionPayload);
}

export function formatConfidence(confidence: number | undefined) {
  return typeof confidence === "number" ? `${confidence}%` : "신뢰도 미확인";
}

export function formatStructuredDates(
  dates: { date?: string; start_time?: string }[] | undefined,
) {
  if (!dates || dates.length === 0) {
    return "미확인";
  }

  return dates
    .map((date) => [date.date, date.start_time].filter(Boolean).join(" "))
    .join(", ");
}

export function formatStructuredInputMode(
  mode: StructuredEventInputMode | null,
) {
  if (mode === "post_text_only") {
    return "본문만";
  }

  if (mode === "post_text_and_ocr") {
    return "본문+OCR";
  }

  return "입력 미확인";
}

export function formatTags(tags: string[] | undefined) {
  return tags && tags.length > 0 ? tags.join(", ") : "미확인";
}
