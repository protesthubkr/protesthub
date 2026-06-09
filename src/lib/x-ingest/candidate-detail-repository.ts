import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePastEventNotice } from "@/lib/event-date-filter";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { XIngestConfigError } from "./config";
import { mergeHydrationReasons } from "./candidate-detail-reasons";
import type { CandidateHydrationRow } from "./candidate-detail-types";
import {
  mergeCandidateMediaKeys,
  needsCandidateDetailHydration,
} from "./hydration-state";
import {
  getCandidateReasons,
  getPostText,
  getPostUrl,
  getReferencedPostIds,
} from "./normalize";
import { getAttachmentMediaKeysByPostId } from "./repository";
import type { XMedia, XPost, XUser } from "./types";

export function getRequiredCandidateHydrationSupabase() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new XIngestConfigError(getMissingSupabaseEnvKeys());
  }

  return supabase;
}

export async function updateHydratedCandidate({
  account,
  candidate,
  media,
  post,
  responseErrors,
  supabase,
}: {
  account: XUser;
  candidate: CandidateHydrationRow;
  media: XMedia[];
  post: XPost;
  responseErrors: unknown[];
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const postText = getPostText(post);
  const quotedPostIds = getReferencedPostIds(post, "quoted");
  const repliedToPostIds = getReferencedPostIds(post, "replied_to");
  const mediaKeys = media.map((item) => item.media_key);
  const nextPayload = {
    ...(candidate.extraction_payload ?? {}),
    needs_ocr: media.length > 0,
    event_date_filter: analyzePastEventNotice(postText),
    quoted_post_ids: quotedPostIds,
    replied_to_post_ids: repliedToPostIds,
    x_hydration: {
      status: "hydrated",
      mode: "admin_requested_detail",
      hydrated_at: now,
      media_count: media.length,
      quoted_post_ids: quotedPostIds,
      raw_x_payload_includes_errors: responseErrors,
    },
  };
  const nextReasons = mergeHydrationReasons(
    candidate.review_reason ?? [],
    getCandidateReasons(post, media),
  );

  const { error } = await supabase
    .from("review_candidates")
    .update({
      source_name: account.name,
      source_url: getPostUrl(account, post),
      text_snapshot: postText,
      media_keys: mediaKeys,
      extraction_payload: nextPayload,
      review_reason: nextReasons,
      updated_at: now,
    })
    .eq("id", candidate.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCandidateById(
  supabase: SupabaseClient,
  candidateId: string,
) {
  const { data, error } = await supabase
    .from("review_candidates")
    .select(
      "id,source_record_id,media_keys,extraction_payload,review_reason",
    )
    .eq("id", candidateId)
    .eq("source_type", "x")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CandidateHydrationRow | null) ?? null;
}

export async function getDeferredNeedsReviewCandidates(
  supabase: SupabaseClient,
  limit: number,
) {
  const { data, error } = await supabase
    .from("review_candidates")
    .select(
      "id,source_record_id,media_keys,extraction_payload,review_reason",
    )
    .eq("status", "needs_review")
    .eq("source_type", "x")
    .order("created_at", { ascending: false })
    .limit(limit * 5);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load candidates.");
  }

  const candidates = data as CandidateHydrationRow[];
  const postMediaKeysByPostId = await getAttachmentMediaKeysByPostId(
    supabase,
    candidates.map((candidate) => candidate.source_record_id),
  );

  return candidates
    .filter((candidate) =>
      shouldHydrateCandidate(candidate, postMediaKeysByPostId),
    )
    .slice(0, limit);
}

function shouldHydrateCandidate(
  candidate: CandidateHydrationRow,
  postMediaKeysByPostId: Map<string, string[]>,
) {
  const mediaKeys = mergeCandidateMediaKeys(
    candidate.media_keys,
    postMediaKeysByPostId.get(candidate.source_record_id),
  );

  return needsCandidateDetailHydration(
    candidate.extraction_payload,
    mediaKeys,
  );
}

function getMissingSupabaseEnvKeys() {
  const missingKeys: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missingKeys.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missingKeys.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missingKeys;
}
