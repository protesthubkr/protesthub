import type { AccountIngestCursor, PostCursor } from "./repository";
import type { XPost } from "./types";

export const MAX_ACCOUNT_LOOKBACK_DAYS = 30;

export function filterPostsAfterStartTime(posts: XPost[], startTime?: string) {
  return posts.filter((post) => isPostOnOrAfterStartTime(post, startTime));
}

export function createRequestCursor({
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

export function chooseLatestPostCursor(
  cursor: AccountIngestCursor | undefined,
  posts: XPost[],
) {
  return pickNewerPostCursor(getCursorPost(cursor), getNewestPostCursor(posts));
}

export function subtractDaysIso(value: string, days: number) {
  return new Date(Date.parse(value) - days * 24 * 60 * 60 * 1000).toISOString();
}

export function maxIsoTime(value: string, minValue: string) {
  return Date.parse(value) > Date.parse(minValue) ? value : minValue;
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
