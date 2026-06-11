import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getCandidateReasons } from "@/lib/x-ingest/normalize-rules";
import {
  createCandidatePost,
} from "./review-promotion-decision";
import type {
  CandidatePromotionRow,
  PublicEventOverlapRow,
} from "./review-promotion-types";

const IGNORED_CANDIDATE_PAGE_SIZE = 500;
const REVIEW_PROMOTION_VERSION = "review_promotion_v1";

export function getRequiredReviewPromotionSupabase() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

export async function promoteCandidate(
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

export async function getIgnoredCandidates(supabase: SupabaseClient) {
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

export async function getPublishedEvents(supabase: SupabaseClient) {
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

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
