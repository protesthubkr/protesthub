import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildCandidateRows } from "./candidate-rows";
import { getCollectionMode } from "./collection-mode";
import { getXIngestConfig, XIngestConfigError } from "./config";
import {
  buildDiscoveredCandidateRows,
  upsertDiscoveredPostsByAuthor,
} from "./discovered-posts";
import { refreshFollowingAccounts } from "./following-accounts";
import {
  createEmptyHydratedTimeline,
  hydrateCandidatePosts,
} from "./run-hydration";
import {
  createMediaMap,
  createPostMap,
  dedupeMedia,
} from "./run-media";
import {
  MAX_ACCOUNT_LOOKBACK_DAYS,
  chooseLatestPostCursor,
  createRequestCursor,
  filterPostsAfterStartTime,
  maxIsoTime,
  subtractDaysIso,
} from "./run-cursor";
import {
  fetchRetweetedOriginalPosts,
  isRetweetWrapper,
} from "./retweet-discovery";
import {
  getAccountIngestCursor,
  updateAccountIngestCursor,
} from "./account-cursor-repository";
import {
  getCollectibleStoredAccounts,
  getStoredFollowingAccountIds,
  insertDiscoveredAccounts,
} from "./account-storage-repository";
import { insertCandidateRows } from "./candidate-repository";
import {
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
} from "./ingest-run-repository";
import { upsertMedia, upsertPostMedia } from "./media-repository";
import { upsertPosts } from "./post-repository";
import type { XIngestResult, XIngestRunOptions } from "./types";
import { XApiError } from "./x-api-client";
import { fetchUserPosts } from "./x-api-tweets";

export { XApiError, XIngestConfigError };

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
  const retweetOriginalsOnly = options.retweetOriginalsOnly ?? false;
  const reviewPastEventNotices = options.reviewPastEventNotices ?? isBackfill;
  const hydrateMode = options.hydrateMode ?? "deferred";
  const collectionMode = getCollectionMode({
    isBackfill,
    retweetOriginalsOnly,
    shouldRefreshFollowing,
  });
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
    retweetOriginalsOnly,
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
    const followedAccountIds = new Set(
      await getStoredFollowingAccountIds(supabase),
    );

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
      const regularPosts = retweetOriginalsOnly
        ? []
        : posts.filter((post) => !isRetweetWrapper(post));
      const retweetedOriginals = await fetchRetweetedOriginalPosts({
        bearerToken: config.bearerToken,
        ignoredAuthorIds: followedAccountIds,
        posts,
        retweetedByAccount: account,
      });
      const hydratedTimeline =
        hydrateMode === "candidate_posts_only"
          ? await hydrateCandidatePosts({
              bearerToken: config.bearerToken,
              posts: regularPosts,
              reviewPastEventNotices,
            })
          : createEmptyHydratedTimeline();
      const hydratedPostsById = createPostMap(hydratedTimeline.data ?? []);
      const regularPostsForStorage = regularPosts.map(
        (post) => hydratedPostsById.get(post.id) ?? post,
      );
      const postsForStorage = [
        ...regularPostsForStorage,
        ...retweetedOriginals.posts,
      ];
      const media = dedupeMedia([
        ...(hydratedTimeline.includes?.media ?? []),
        ...retweetedOriginals.media,
      ]);
      const mediaByKey = createMediaMap(media);

      counters.postsSeen += posts.length + retweetedOriginals.posts.length;
      await insertDiscoveredAccounts(supabase, retweetedOriginals.authors);
      await upsertMedia(supabase, media);
      counters.postsWritten += await upsertPosts(supabase, runId, account, [
        ...regularPostsForStorage,
      ]);
      counters.postsWritten += await upsertDiscoveredPostsByAuthor({
        authors: retweetedOriginals.authors,
        posts: retweetedOriginals.posts,
        runId,
        supabase,
      });
      await upsertPostMedia(
        supabase,
        postsForStorage,
        new Set(media.map((item) => item.media_key)),
      );
      const candidateInsertResult = await insertCandidateRows(supabase, [
        ...buildCandidateRows({
          account,
          hydrateMode,
          posts: regularPostsForStorage,
          mediaByKey,
          reviewPastEventNotices,
        }),
        ...buildDiscoveredCandidateRows({
          authors: retweetedOriginals.authors,
          discoveryByPostId: retweetedOriginals.discoveryByPostId,
          mediaByKey,
          posts: retweetedOriginals.posts,
          reviewPastEventNotices,
        }),
      ]);

      counters.candidatesCreated += candidateInsertResult.created;
      counters.candidatesPromoted += candidateInsertResult.promoted;
      counters.ignoredCandidatesCreated +=
        candidateInsertResult.ignoredCreated;
      counters.needsReviewCandidatesCreated +=
        candidateInsertResult.needsReviewCreated;
      if (!retweetOriginalsOnly) {
        await updateAccountIngestCursor({
          accountId: account.id,
          checkedAt: new Date().toISOString(),
          latestPost: chooseLatestPostCursor(cursor, posts),
          runId,
          supabase,
        });
      }
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
