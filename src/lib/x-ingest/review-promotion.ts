import "server-only";

import { getPromotionDecision } from "./review-promotion-decision";
import {
  getIgnoredCandidates,
  getPublishedEvents,
  getRequiredReviewPromotionSupabase,
  promoteCandidate,
} from "./review-promotion-repository";
import {
  compactText,
  createEmptyPromotionResult,
} from "./review-promotion-result";
import type { IgnoredCandidatePromotionResult } from "./review-promotion-types";

export type { IgnoredCandidatePromotionResult } from "./review-promotion-types";

export async function previewIgnoredCandidatePromotion() {
  return runIgnoredCandidatePromotion({ apply: false });
}

export async function promoteIgnoredCandidatesForReview() {
  return runIgnoredCandidatePromotion({ apply: true });
}

async function runIgnoredCandidatePromotion({
  apply,
}: {
  apply: boolean;
}): Promise<IgnoredCandidatePromotionResult> {
  const supabase = getRequiredReviewPromotionSupabase();
  const [candidates, publicEvents] = await Promise.all([
    getIgnoredCandidates(supabase),
    getPublishedEvents(supabase),
  ]);
  const result = createEmptyPromotionResult(candidates.length);

  for (const candidate of candidates) {
    const decision = getPromotionDecision(candidate, publicEvents);

    if (!decision.shouldPromote) {
      result.skipped[decision.skipReason] += 1;
      continue;
    }

    result.eligible += 1;

    if (result.samples.length < 5) {
      result.samples.push({
        accountName: candidate.source_name,
        id: candidate.id,
        reasons: decision.reviewReasons,
        sourcePostUrl: candidate.source_url,
        text: compactText(candidate.text_snapshot, 120),
      });
    }

    if (apply) {
      await promoteCandidate(supabase, candidate);
      result.promoted += 1;
    }
  }

  return result;
}
