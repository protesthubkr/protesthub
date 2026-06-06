import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildCandidateRows } from "./candidate-rows";
import { getXIngestConfig, XIngestConfigError } from "./config";
import {
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
  getLatestSeenPostId,
  getPreviousSuccessfulIngestStartedAt,
  insertCandidateRows,
  upsertAccounts,
  upsertMedia,
  upsertPostMedia,
  upsertPosts,
} from "./repository";
import type { XIngestResult, XIngestRunOptions, XMedia, XPost } from "./types";
import { fetchFollowingAccounts, fetchUserPosts, XApiError } from "./x-api";

export { XApiError, XIngestConfigError };

export async function runXIngest(
  options: XIngestRunOptions = {},
): Promise<XIngestResult> {
  const config = getXIngestConfig();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new XIngestConfigError(getMissingSupabaseEnvKeys());
  }

  const previousIngestStartedAt =
    await getPreviousSuccessfulIngestStartedAt(supabase);
  const isBackfill = Boolean(options.startTime);
  const timelinePagesPerAccount =
    options.maxTimelinePagesPerAccount ??
    (isBackfill
      ? config.backfillTimelinePagesPerAccount
      : config.timelinePagesPerAccount);
  const reviewPastEventNotices = options.reviewPastEventNotices ?? isBackfill;
  const runId = await createIngestRun(supabase, {
    postsPerAccount: config.postsPerAccount,
    maxFollowingAccounts: config.maxFollowingAccounts,
    maxTimelinePagesPerAccount: timelinePagesPerAccount,
    includeReplies: config.includeReplies,
    collectionMode: isBackfill
      ? "backfill_from_start_time"
      : "incremental_since_latest_seen_post",
    requestedStartTime: options.startTime,
    previousIngestStartedAt,
    reviewPastEventNotices,
  });
  const counters = createEmptyIngestCounters();

  try {
    const followingAccounts = await fetchFollowingAccounts({
      bearerToken: config.bearerToken,
      operatingUserId: config.operatingUserId,
      maxAccounts: config.maxFollowingAccounts,
    });
    const collectibleAccounts = followingAccounts.filter(
      (account) => !account.protected,
    );
    counters.accountsSeen = collectibleAccounts.length;

    await upsertAccounts(supabase, collectibleAccounts);

    for (const account of collectibleAccounts) {
      const sinceId = isBackfill
        ? undefined
        : await getLatestSeenPostId(supabase, account.id);
      const startTime =
        options.startTime ?? (sinceId ? undefined : previousIngestStartedAt);
      const timeline = await fetchUserPosts({
        bearerToken: config.bearerToken,
        includeReplies: config.includeReplies,
        userId: account.id,
        maxResults: config.postsPerAccount,
        maxPages: timelinePagesPerAccount,
        sinceId,
        startTime,
      });
      const posts = filterPostsAfterStartTime(timeline.data ?? [], startTime);
      const media = dedupeMedia(timeline.includes?.media ?? []);
      const mediaByKey = createMediaMap(media);

      counters.postsSeen += posts.length;
      await upsertMedia(supabase, media);
      counters.postsWritten += await upsertPosts(
        supabase,
        runId,
        account,
        posts,
      );
      await upsertPostMedia(supabase, posts);
      counters.candidatesCreated += await insertCandidateRows(
        supabase,
        buildCandidateRows({
          account,
          posts,
          mediaByKey,
          reviewPastEventNotices,
        }),
      );
    }

    await finishIngestRun(supabase, runId, "succeeded", counters);

    return {
      runId,
      status: "succeeded",
      ...counters,
    };
  } catch (error) {
    await finishIngestRun(supabase, runId, "failed", counters, error);
    throw error;
  }
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

function filterPostsAfterStartTime(posts: XPost[], startTime?: string) {
  return posts.filter((post) => isPostOnOrAfterStartTime(post, startTime));
}

function isPostOnOrAfterStartTime(post: XPost, startTime?: string) {
  if (!startTime) {
    return true;
  }

  if (!post.created_at) {
    return false;
  }

  return Date.parse(post.created_at) >= Date.parse(startTime);
}

function createMediaMap(media: XMedia[]) {
  return new Map(media.map((item) => [item.media_key, item]));
}

function dedupeMedia(media: XMedia[]) {
  return Array.from(createMediaMap(media).values());
}
