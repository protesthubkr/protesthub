import type { IgnoredCandidatePromotionResult } from "./review-promotion-types";

export function createEmptyPromotionResult(
  scanned: number,
): IgnoredCandidatePromotionResult {
  return {
    scanned,
    eligible: 0,
    promoted: 0,
    skipped: {
      alreadyTouched: 0,
      noReviewRule: 0,
      pastEventDate: 0,
      protectedDecision: 0,
      publicEventOverlap: 0,
    },
    samples: [],
  };
}

export function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}
