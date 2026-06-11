import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCandidateById,
  getDeferredNeedsReviewCandidates,
  getRequiredCandidateHydrationSupabase,
  updateHydratedCandidate,
} from "./candidate-detail-repository";
import type {
  CandidateDetailHydrationResult,
  CandidateHydrationRow,
} from "./candidate-detail-types";
import { dedupeCandidates, findAuthor } from "./candidate-detail-utils";
import { getXIngestConfig } from "./config";
import { insertDiscoveredAccounts } from "./account-storage-repository";
import {
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
} from "./ingest-run-repository";
import { upsertMedia, upsertPostMedia } from "./media-repository";
import { getMediaForPost } from "./normalize-text";
import { upsertPosts } from "./post-repository";
import { createMediaMap, createPostMap, dedupeMedia } from "./run-media";
import { fetchPostsByIds } from "./x-api-tweets";

const DETAIL_HYDRATION_STRATEGY = "candidate_detail_hydration";
const DEFAULT_PENDING_HYDRATION_LIMIT = 50;

export type {
  CandidateDetailHydrationResult,
  CandidateHydrationRow,
} from "./candidate-detail-types";

export async function hydrateCandidateDetail(
  candidateId: string,
): Promise<CandidateDetailHydrationResult> {
  const supabase = getRequiredCandidateHydrationSupabase();
  const candidate = await getCandidateById(supabase, candidateId);

  if (!candidate) {
    throw new Error("Candidate not found.");
  }

  return hydrateCandidateRows({
    metadata: {
      mode: "single_candidate",
      candidateId,
    },
    rows: [candidate],
    supabase,
  });
}

export async function hydratePendingCandidateDetails({
  limit = DEFAULT_PENDING_HYDRATION_LIMIT,
}: {
  limit?: number;
} = {}): Promise<CandidateDetailHydrationResult> {
  const supabase = getRequiredCandidateHydrationSupabase();
  const candidates = await getDeferredNeedsReviewCandidates(supabase, limit);

  if (candidates.length === 0) {
    return {
      requested: 0,
      hydrated: 0,
      skipped: 0,
    };
  }

  return hydrateCandidateRows({
    metadata: {
      mode: "pending_needs_review_candidates",
      limit,
    },
    rows: candidates,
    supabase,
  });
}

async function hydrateCandidateRows({
  metadata,
  rows,
  supabase,
}: {
  metadata: Record<string, unknown>;
  rows: CandidateHydrationRow[];
  supabase: SupabaseClient;
}): Promise<CandidateDetailHydrationResult> {
  const config = getXIngestConfig();
  const uniqueRows = dedupeCandidates(rows);
  const runId = await createIngestRun(
    supabase,
    {
      collectionMode: DETAIL_HYDRATION_STRATEGY,
      hydrateMode: "admin_requested_detail",
      requestedCandidates: uniqueRows.length,
      ...metadata,
    },
    DETAIL_HYDRATION_STRATEGY,
  );
  const counters = createEmptyIngestCounters();

  try {
    const response = await fetchPostsByIds({
      bearerToken: config.bearerToken,
      postIds: uniqueRows.map((candidate) => candidate.source_record_id),
    });
    const postsById = createPostMap(response.data ?? []);
    const media = dedupeMedia(response.includes?.media ?? []);
    const mediaByKey = createMediaMap(media);
    const users = response.includes?.users ?? [];
    const mediaKeySet = new Set(media.map((item) => item.media_key));
    let hydrated = 0;
    let skipped = 0;

    counters.accountsSeen = new Set(users.map((user) => user.id)).size;
    counters.postsSeen = uniqueRows.length;
    await insertDiscoveredAccounts(supabase, users);
    await upsertMedia(supabase, media);

    for (const candidate of uniqueRows) {
      const post = postsById.get(candidate.source_record_id);
      const account = post ? findAuthor(users, post) : undefined;

      if (!post || !account) {
        skipped += 1;
        continue;
      }

      const postMedia = getMediaForPost(post, mediaByKey);
      counters.postsWritten += await upsertPosts(supabase, runId, account, [
        post,
      ]);
      await upsertPostMedia(supabase, [post], mediaKeySet);
      await updateHydratedCandidate({
        account,
        candidate,
        media: postMedia,
        post,
        responseErrors: response.errors ?? [],
        supabase,
      });
      hydrated += 1;
    }

    await finishIngestRun(supabase, runId, "succeeded", counters);

    return {
      requested: uniqueRows.length,
      hydrated,
      skipped,
      runId,
    };
  } catch (error) {
    await finishIngestRun(supabase, runId, "failed", counters, error);
    throw error;
  }
}
