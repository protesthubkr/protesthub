import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePastEventNotice } from "@/lib/event-date-filter";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getXIngestConfig, XIngestConfigError } from "./config";
import {
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
  getAttachmentMediaKeysByPostId,
  upsertAccounts,
  upsertMedia,
  upsertPostMedia,
  upsertPosts,
} from "./repository";
import {
  X_DETAIL_DEFERRED_REASON,
  X_DETAIL_HYDRATED_REASON,
  X_UNHYDRATED_MEDIA_REASON,
  X_UNHYDRATED_QUOTE_REASON,
  mergeCandidateMediaKeys,
  needsCandidateDetailHydration,
} from "./hydration-state";
import {
  getCandidateReasons,
  getMediaForPost,
  getPostText,
  getPostUrl,
  getReferencedPostIds,
} from "./normalize";
import type { XMedia, XPost, XUser } from "./types";
import { fetchPostsByIds } from "./x-api";

const DETAIL_HYDRATION_STRATEGY = "candidate_detail_hydration";
const DEFAULT_PENDING_HYDRATION_LIMIT = 50;

type CandidateHydrationRow = {
  id: string;
  x_post_id: string;
  media_keys: string[] | null;
  extraction_payload: Record<string, unknown> | null;
  candidate_reason: string[] | null;
};

type CandidateDetailHydrationResult = {
  requested: number;
  hydrated: number;
  skipped: number;
  runId?: string;
};

export async function hydrateCandidateDetail(
  candidateId: string,
): Promise<CandidateDetailHydrationResult> {
  const supabase = getRequiredSupabase();
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
  const supabase = getRequiredSupabase();
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
      postIds: uniqueRows.map((candidate) => candidate.x_post_id),
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
    await upsertAccounts(supabase, users);
    await upsertMedia(supabase, media);

    for (const candidate of uniqueRows) {
      const post = postsById.get(candidate.x_post_id);
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

async function updateHydratedCandidate({
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
    candidate.candidate_reason ?? [],
    getCandidateReasons(post, media),
  );

  const { error } = await supabase
    .from("x_event_candidates")
    .update({
      source_account_name: account.name,
      source_post_url: getPostUrl(account, post),
      text_snapshot: postText,
      media_keys: mediaKeys,
      extraction_payload: nextPayload,
      candidate_reason: nextReasons,
      updated_at: now,
    })
    .eq("id", candidate.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function getCandidateById(
  supabase: SupabaseClient,
  candidateId: string,
) {
  const { data, error } = await supabase
    .from("x_event_candidates")
    .select(
      "id,x_post_id,media_keys,extraction_payload,candidate_reason",
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CandidateHydrationRow | null) ?? null;
}

async function getDeferredNeedsReviewCandidates(
  supabase: SupabaseClient,
  limit: number,
) {
  const { data, error } = await supabase
    .from("x_event_candidates")
    .select(
      "id,x_post_id,media_keys,extraction_payload,candidate_reason",
    )
    .eq("status", "needs_review")
    .order("created_at", { ascending: false })
    .limit(limit * 5);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load candidates.");
  }

  const candidates = data as CandidateHydrationRow[];
  const postMediaKeysByPostId = await getAttachmentMediaKeysByPostId(
    supabase,
    candidates.map((candidate) => candidate.x_post_id),
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
    postMediaKeysByPostId.get(candidate.x_post_id),
  );

  return needsCandidateDetailHydration(
    candidate.extraction_payload,
    mediaKeys,
  );
}

function getRequiredSupabase() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new XIngestConfigError(getMissingSupabaseEnvKeys());
  }

  return supabase;
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

function mergeHydrationReasons(
  currentReasons: string[],
  nextReasons: string[],
) {
  const staleReasons = new Set([
    X_DETAIL_DEFERRED_REASON,
    X_UNHYDRATED_MEDIA_REASON,
    X_UNHYDRATED_QUOTE_REASON,
  ]);

  return Array.from(
    new Set([
      ...currentReasons.filter((reason) => !staleReasons.has(reason)),
      ...nextReasons,
      X_DETAIL_HYDRATED_REASON,
    ]),
  );
}

function findAuthor(users: XUser[], post: XPost) {
  return users.find((user) => user.id === post.author_id) ?? users[0];
}

function dedupeCandidates(rows: CandidateHydrationRow[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function createPostMap(posts: XPost[]) {
  return new Map(posts.map((post) => [post.id, post]));
}

function createMediaMap(media: XMedia[]) {
  return new Map(media.map((item) => [item.media_key, item]));
}

function dedupeMedia(media: XMedia[]) {
  return Array.from(createMediaMap(media).values());
}
