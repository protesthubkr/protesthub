import { analyzePastEventNotice } from "@/lib/event-date-filter";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildCandidateRows } from "./candidate-rows";
import { getXIngestConfig, XIngestConfigError } from "./config";
import {
  type AccountIngestCursor,
  type PostCursor,
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
  getAccountIngestCursor,
  getCollectibleStoredAccounts,
  insertCandidateRows,
  updateAccountIngestCursor,
  upsertAccounts,
  upsertMedia,
  upsertPostMedia,
  upsertPosts,
} from "./repository";
import type { XIngestResult, XIngestRunOptions, XMedia, XPost } from "./types";
import {
  fetchFollowingAccounts,
  fetchPostsByIds,
  fetchUserPosts,
  XApiError,
} from "./x-api";
import { getPostText, shouldReviewCandidate } from "./normalize";

export { XApiError, XIngestConfigError };

const MAX_ACCOUNT_LOOKBACK_DAYS = 30;

export async function runXIngest(
  options: XIngestRunOptions = {},
): Promise<XIngestResult> {
  const config = getXIngestConfig();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new XIngestConfigError(getMissingSupabaseEnvKeys());
  }

  const runStartedAt = new Date().toISOString();
  const oldestAllowedStartTime = subtractDaysIso(
    runStartedAt,
    MAX_ACCOUNT_LOOKBACK_DAYS,
  );
  const isBackfill = Boolean(options.startTime);
  const requestedStartTime = options.startTime;
  const effectiveRequestedStartTime = requestedStartTime
    ? maxIsoTime(requestedStartTime, oldestAllowedStartTime)
    : undefined;
  const timelinePagesPerAccount =
    options.maxTimelinePagesPerAccount ??
    (isBackfill
      ? config.backfillTimelinePagesPerAccount
      : config.timelinePagesPerAccount);
  const shouldRefreshFollowing = options.refreshFollowing ?? false;
  const reviewPastEventNotices = options.reviewPastEventNotices ?? isBackfill;
  const hydrateMode = options.hydrateMode ?? "deferred";
  const collectionMode = getCollectionMode({ isBackfill, shouldRefreshFollowing });
  const runId = await createIngestRun(supabase, {
    postsPerAccount: config.postsPerAccount,
    maxFollowingAccounts: config.maxFollowingAccounts,
    maxTimelinePagesPerAccount: timelinePagesPerAccount,
    includeReplies: config.includeReplies,
    accountSource: shouldRefreshFollowing
      ? "x_following_api_refresh"
      : "stored_x_accounts",
    collectionMode,
    hydrateMode,
    maxAccountLookbackDays: MAX_ACCOUNT_LOOKBACK_DAYS,
    oldestAllowedStartTime,
    requestedStartTime,
    effectiveRequestedStartTime,
    reviewPastEventNotices,
  });
  const counters = createEmptyIngestCounters();

  try {
    const collectibleAccounts = shouldRefreshFollowing
      ? await refreshFollowingAccounts({
          bearerToken: config.bearerToken,
          maxAccounts: config.maxFollowingAccounts,
          operatingUserId: config.operatingUserId,
          supabase,
        })
      : await getCollectibleStoredAccounts(
          supabase,
          config.maxFollowingAccounts,
        );
    counters.accountsSeen = collectibleAccounts.length;

    for (const account of collectibleAccounts) {
      const cursor = isBackfill
        ? undefined
        : await getAccountIngestCursor(supabase, account.id);
      const requestCursor = createRequestCursor({
        cursor,
        effectiveRequestedStartTime,
        oldestAllowedStartTime,
      });
      const timeline = await fetchUserPosts({
        bearerToken: config.bearerToken,
        includeReplies: config.includeReplies,
        userId: account.id,
        maxResults: config.postsPerAccount,
        maxPages: timelinePagesPerAccount,
        sinceId: requestCursor.sinceId,
        startTime: requestCursor.startTime,
      });
      const posts = filterPostsAfterStartTime(
        timeline.data ?? [],
        requestCursor.startTime,
      );
      const hydratedTimeline =
        hydrateMode === "candidate_posts_only"
          ? await hydrateCandidatePosts({
              bearerToken: config.bearerToken,
              posts,
              reviewPastEventNotices,
            })
          : createEmptyHydratedTimeline();
      const hydratedPostsById = createPostMap(hydratedTimeline.data ?? []);
      const postsForStorage = posts.map(
        (post) => hydratedPostsById.get(post.id) ?? post,
      );
      const media = dedupeMedia(hydratedTimeline.includes?.media ?? []);
      const mediaByKey = createMediaMap(media);

      counters.postsSeen += postsForStorage.length;
      await upsertMedia(supabase, media);
      counters.postsWritten += await upsertPosts(
        supabase,
        runId,
        account,
        postsForStorage,
      );
      await upsertPostMedia(
        supabase,
        postsForStorage,
        new Set(media.map((item) => item.media_key)),
      );
      counters.candidatesCreated += await insertCandidateRows(
        supabase,
        buildCandidateRows({
          account,
          hydrateMode,
          posts: postsForStorage,
          mediaByKey,
          reviewPastEventNotices,
        }),
      );
      await updateAccountIngestCursor({
        accountId: account.id,
        checkedAt: new Date().toISOString(),
        latestPost: chooseLatestPostCursor(cursor, postsForStorage),
        runId,
        supabase,
      });
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

function createEmptyHydratedTimeline() {
  return { data: [], includes: { media: [], tweets: [], users: [] } };
}

async function refreshFollowingAccounts({
  bearerToken,
  maxAccounts,
  operatingUserId,
  supabase,
}: {
  bearerToken: string;
  maxAccounts: number;
  operatingUserId: string;
  supabase: SupabaseClient;
}) {
  const followingAccounts = await fetchFollowingAccounts({
    bearerToken,
    operatingUserId,
    maxAccounts,
  });

  await upsertAccounts(supabase, followingAccounts);

  return followingAccounts.filter((account) => !account.protected);
}

function getCollectionMode({
  isBackfill,
  shouldRefreshFollowing,
}: {
  isBackfill: boolean;
  shouldRefreshFollowing: boolean;
}) {
  if (isBackfill) {
    return "bounded_backfill_from_start_time";
  }

  return shouldRefreshFollowing
    ? "following_refresh_account_cursor_incremental"
    : "account_cursor_incremental";
}

async function hydrateCandidatePosts({
  bearerToken,
  posts,
  reviewPastEventNotices,
}: {
  bearerToken: string;
  posts: XPost[];
  reviewPastEventNotices: boolean;
}) {
  const postIds = posts
    .filter((post) =>
      shouldHydrateCandidatePost({ post, reviewPastEventNotices }),
    )
    .map((post) => post.id);

  if (postIds.length === 0) {
    return { data: [], includes: { media: [], tweets: [], users: [] } };
  }

  return fetchPostsByIds({ bearerToken, postIds });
}

function shouldHydrateCandidatePost({
  post,
  reviewPastEventNotices,
}: {
  post: XPost;
  reviewPastEventNotices: boolean;
}) {
  if (!shouldReviewCandidate(post, [])) {
    return false;
  }

  if (reviewPastEventNotices) {
    return true;
  }

  return !analyzePastEventNotice(getPostText(post)).ignoredAsPast;
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

function createRequestCursor({
  cursor,
  effectiveRequestedStartTime,
  oldestAllowedStartTime,
}: {
  cursor: AccountIngestCursor | undefined;
  effectiveRequestedStartTime: string | undefined;
  oldestAllowedStartTime: string;
}) {
  if (effectiveRequestedStartTime) {
    return {
      source: "requested_start_time",
      startTime: effectiveRequestedStartTime,
    };
  }

  if (
    cursor?.sinceId &&
    cursor.lastIngestedPostCreatedAt &&
    cursor.lastIngestedPostCreatedAt >= oldestAllowedStartTime
  ) {
    return {
      sinceId: cursor.sinceId,
      source: cursor.source,
    };
  }

  return {
    source: cursor?.source ?? "none",
    startTime: maxIsoTime(
      cursor?.lastIngestedAt ??
        cursor?.lastIngestedPostCreatedAt ??
        oldestAllowedStartTime,
      oldestAllowedStartTime,
    ),
  };
}

function chooseLatestPostCursor(
  cursor: AccountIngestCursor | undefined,
  posts: XPost[],
) {
  return pickNewerPostCursor(getCursorPost(cursor), getNewestPostCursor(posts));
}

function getCursorPost(cursor: AccountIngestCursor | undefined) {
  if (!cursor?.sinceId || !cursor.lastIngestedPostCreatedAt) {
    return undefined;
  }

  return {
    createdAt: cursor.lastIngestedPostCreatedAt,
    postId: cursor.sinceId,
  } satisfies PostCursor;
}

function getNewestPostCursor(posts: XPost[]) {
  return posts.reduce<PostCursor | undefined>((newestPost, post) => {
    if (!post.created_at) {
      return newestPost;
    }

    const timestamp = Date.parse(post.created_at);

    if (!Number.isFinite(timestamp)) {
      return newestPost;
    }

    const createdAt = new Date(timestamp).toISOString();
    const currentPost = { createdAt, postId: post.id } satisfies PostCursor;

    return pickNewerPostCursor(newestPost, currentPost);
  }, undefined);
}

function pickNewerPostCursor(
  currentPost: PostCursor | undefined,
  nextPost: PostCursor | undefined,
) {
  if (!currentPost) {
    return nextPost;
  }

  if (!nextPost) {
    return currentPost;
  }

  return Date.parse(nextPost.createdAt) > Date.parse(currentPost.createdAt)
    ? nextPost
    : currentPost;
}

function subtractDaysIso(value: string, days: number) {
  return new Date(Date.parse(value) - days * 24 * 60 * 60 * 1000).toISOString();
}

function maxIsoTime(value: string, minValue: string) {
  return Date.parse(value) > Date.parse(minValue) ? value : minValue;
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
