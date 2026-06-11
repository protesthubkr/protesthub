import { analyzePastEventNotice } from "@/lib/event-date-filter";
import {
  getCandidateReasons,
  shouldReviewCandidate,
} from "@/lib/x-ingest/normalize-rules";
import type { XPost } from "@/lib/x-ingest/types";
import { overlapsPublishedEvent } from "./review-promotion-overlap";
import type {
  CandidatePromotionRow,
  IgnoredCandidatePromotionResult,
  PublicEventOverlapRow,
} from "./review-promotion-types";

const STRUCTURED_EVENT_CUE_PATTERN =
  /(?:일시|일정|일시와\s*장소|장소|집결|개최|시작|심문기일|현장\s*신청)/;
const MIGRATION_NON_EVENT_PATTERN =
  /(?:모집|채용|공모|성명|논평|보도자료|입장문|카드뉴스)/;

export function getPromotionDecision(
  candidate: CandidatePromotionRow,
  publicEvents: PublicEventOverlapRow[],
):
  | {
      shouldPromote: true;
      reviewReasons: string[];
    }
  | {
      shouldPromote: false;
      skipReason: keyof IgnoredCandidatePromotionResult["skipped"];
    } {
  if (hasProtectedDecision(candidate)) {
    return { shouldPromote: false, skipReason: "protectedDecision" };
  }

  if (!isStrictAutoIgnoredCandidate(candidate)) {
    return { shouldPromote: false, skipReason: "alreadyTouched" };
  }

  const post = createCandidatePost(candidate);

  if (!shouldReviewCandidate(post, [])) {
    return { shouldPromote: false, skipReason: "noReviewRule" };
  }

  if (!hasMigrationEventStructure(candidate.text_snapshot)) {
    return { shouldPromote: false, skipReason: "noReviewRule" };
  }

  if (hasMigrationNonEventCue(candidate.text_snapshot)) {
    return { shouldPromote: false, skipReason: "noReviewRule" };
  }

  if (!hasUpcomingDetectedDate(candidate.text_snapshot)) {
    return { shouldPromote: false, skipReason: "pastEventDate" };
  }

  if (overlapsPublishedEvent(candidate, publicEvents)) {
    return { shouldPromote: false, skipReason: "publicEventOverlap" };
  }

  return {
    shouldPromote: true,
    reviewReasons: getReviewReasons(post),
  };
}

export function createCandidatePost(candidate: CandidatePromotionRow): XPost {
  const mediaKeys = candidate.media_keys ?? [];

  return {
    id: candidate.source_record_id,
    text: candidate.text_snapshot,
    attachments: mediaKeys.length > 0 ? { media_keys: mediaKeys } : undefined,
  };
}

export function getReviewReasons(post: XPost) {
  return getCandidateReasons(post, []).filter(
    (reason) =>
      reason.startsWith("review_rule:") ||
      reason.startsWith("review_keywords:") ||
      reason.startsWith("strong_keyword:"),
  );
}

function isStrictAutoIgnoredCandidate(candidate: CandidatePromotionRow) {
  return (
    new Date(candidate.created_at).getTime() ===
    new Date(candidate.updated_at).getTime()
  );
}

function hasProtectedDecision(candidate: CandidatePromotionRow) {
  const reasons = candidate.review_reason ?? [];

  return reasons.some(
    (reason) =>
      reason.startsWith("admin_") ||
      reason === "published_event" ||
      reason === "unpublished_event",
  );
}

function hasUpcomingDetectedDate(text: string) {
  const dateFilter = analyzePastEventNotice(text);

  return dateFilter.detectedDates.some((date) => date >= dateFilter.today);
}

function hasMigrationEventStructure(text: string) {
  return STRUCTURED_EVENT_CUE_PATTERN.test(text);
}

function hasMigrationNonEventCue(text: string) {
  return MIGRATION_NON_EVENT_PATTERN.test(text);
}
