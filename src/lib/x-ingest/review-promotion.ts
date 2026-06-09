import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePastEventNotice } from "@/lib/event-date-filter";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getCandidateReasons,
  shouldReviewCandidate,
} from "@/lib/x-ingest/normalize";
import type { XPost } from "@/lib/x-ingest/types";

const IGNORED_CANDIDATE_PAGE_SIZE = 500;
const REVIEW_PROMOTION_VERSION = "review_promotion_v1";
const STRUCTURED_EVENT_CUE_PATTERN =
  /(?:일시|일정|일시와\s*장소|장소|집결|개최|시작|심문기일|현장\s*신청)/;
const MIGRATION_NON_EVENT_PATTERN =
  /(?:모집|채용|공모|성명|논평|보도자료|입장문|카드뉴스)/;

type CandidatePromotionRow = {
  id: string;
  source_record_id: string;
  source_type: "x" | "telegram";
  source_name: string;
  source_url: string;
  text_snapshot: string;
  media_keys: string[] | null;
  extraction_payload: Record<string, unknown> | null;
  review_reason: string[] | null;
  created_at: string;
  updated_at: string;
};

type PublicEventOverlapRow = {
  id: string;
  title: string;
  venue: string;
  address: string;
  region: string;
  source_account_name: string;
  source_post_url: string;
  dates: { date: string; start_time: string | null }[];
};

export type IgnoredCandidatePromotionResult = {
  scanned: number;
  eligible: number;
  promoted: number;
  skipped: {
    alreadyTouched: number;
    noReviewRule: number;
    pastEventDate: number;
    protectedDecision: number;
    publicEventOverlap: number;
  };
  samples: {
    accountName: string;
    id: string;
    reasons: string[];
    sourcePostUrl: string;
    text: string;
  }[];
};

export async function previewIgnoredCandidatePromotion() {
  return runIgnoredCandidatePromotion({ apply: false });
}

export async function promoteIgnoredCandidatesForReview() {
  return runIgnoredCandidatePromotion({ apply: true });
}

async function runIgnoredCandidatePromotion({ apply }: { apply: boolean }) {
  const supabase = getRequiredSupabase();
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

function getPromotionDecision(
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

async function promoteCandidate(
  supabase: SupabaseClient,
  candidate: CandidatePromotionRow,
) {
  const now = new Date().toISOString();
  const nextPayload = {
    ...(candidate.extraction_payload ?? {}),
    review_promotion: {
      promoted_at: now,
      scope: "strict_auto_ignored",
      version: REVIEW_PROMOTION_VERSION,
    },
  };
  const nextReasons = mergeReasons(candidate.review_reason ?? [], [
    ...getCandidateReasons(createCandidatePost(candidate), []),
    "review_migration:ignored_to_needs_review",
    "review_migration_scope:strict_auto_ignored",
    `review_migration_version:${REVIEW_PROMOTION_VERSION}`,
  ]);

  const { error } = await supabase
    .from("review_candidates")
    .update({
      status: "needs_review",
      extraction_payload: nextPayload,
      review_reason: nextReasons,
      updated_at: now,
    })
    .eq("id", candidate.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function getIgnoredCandidates(supabase: SupabaseClient) {
  const candidates: CandidatePromotionRow[] = [];

  for (let from = 0; ; from += IGNORED_CANDIDATE_PAGE_SIZE) {
    const to = from + IGNORED_CANDIDATE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("review_candidates")
      .select(
        "id,source_record_id,source_type,source_name,source_url,text_snapshot,media_keys,extraction_payload,review_reason,created_at,updated_at",
      )
      .eq("status", "ignored")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to load ignored candidates.");
    }

    candidates.push(...(data as CandidatePromotionRow[]));

    if (data.length < IGNORED_CANDIDATE_PAGE_SIZE) {
      return candidates;
    }
  }
}

async function getPublishedEvents(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("public_event_cards")
    .select(
      "id,title,venue,address,region,source_account_name,source_post_url,dates",
    )
    .eq("status", "published");

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load published events.");
  }

  return data as PublicEventOverlapRow[];
}

function createCandidatePost(candidate: CandidatePromotionRow): XPost {
  const mediaKeys = candidate.media_keys ?? [];

  return {
    id: candidate.source_record_id,
    text: candidate.text_snapshot,
    attachments: mediaKeys.length > 0 ? { media_keys: mediaKeys } : undefined,
  };
}

function getReviewReasons(post: XPost) {
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

function overlapsPublishedEvent(
  candidate: CandidatePromotionRow,
  events: PublicEventOverlapRow[],
) {
  const text = candidate.text_snapshot;
  const normalizedText = normalizeText(text);

  return events.some((event) => {
    if (candidate.source_url === event.source_post_url) {
      return true;
    }

    const eventText = [
      event.title,
      event.venue,
      event.address,
      event.region,
      event.source_account_name,
    ]
      .filter(Boolean)
      .join(" ");
    const textSimilarity = jaccardSimilarity(text, eventText);
    const hasEventDate = event.dates.some((date) =>
      getDateTextTokens(date.date).some((token) => text.includes(token)),
    );
    const hasEventPlace = [event.venue, event.address, event.region]
      .filter(Boolean)
      .some((value) => {
        const normalizedValue = normalizeText(value);
        const searchValue = normalizedValue.slice(
          0,
          Math.min(normalizedValue.length, 12),
        );

        return searchValue.length >= 2 && normalizedText.includes(searchValue);
      });

    return textSimilarity >= 0.32 || (hasEventDate && hasEventPlace);
  });
}

function getDateTextTokens(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return [];
  }

  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");

  return [
    `${month}.${day}`,
    `${paddedMonth}.${paddedDay}`,
    `${month}/${day}`,
    `${paddedMonth}/${paddedDay}`,
    `${month}월 ${day}일`,
    `${month}월${day}일`,
  ];
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = createTokenSet(left);
  const rightTokens = createTokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function createTokenSet(text: string) {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((token) => token.length >= 2),
  );
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createEmptyPromotionResult(
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

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getRequiredSupabase() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}
