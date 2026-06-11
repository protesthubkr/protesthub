import type {
  XIncludes,
  XSinglePostResponse,
  XTimelineResponse,
} from "./types";
import {
  MEDIA_FIELDS,
  TWEET_DETAIL_EXPANSIONS,
  TWEET_FIELDS,
  USER_FIELDS,
  X_API_BASE_URL,
} from "./x-api-fields";
import { fetchX } from "./x-api-client";

export async function fetchUserPosts({
  bearerToken,
  includeReplies,
  userId,
  maxResults,
  maxPages,
  sinceId,
  startTime,
}: {
  bearerToken: string;
  includeReplies: boolean;
  userId: string;
  maxResults: number;
  maxPages: number;
  sinceId?: string;
  startTime?: string;
}) {
  const mergedResponse: XTimelineResponse = {
    data: [],
  };
  let paginationToken: string | undefined;
  let pagesFetched = 0;

  do {
    const page = await fetchUserPostsPage({
      bearerToken,
      includeReplies,
      userId,
      maxResults,
      paginationToken,
      sinceId,
      startTime,
    });

    mergedResponse.data?.push(...(page.data ?? []));
    mergedResponse.errors = [
      ...(mergedResponse.errors ?? []),
      ...(page.errors ?? []),
    ];
    mergedResponse.meta = page.meta;
    paginationToken = page.meta?.next_token;
    pagesFetched += 1;
  } while (paginationToken && pagesFetched < maxPages);

  return mergedResponse;
}

export async function fetchPostsByIds({
  bearerToken,
  postIds,
}: {
  bearerToken: string;
  postIds: string[];
}) {
  const mergedResponse: XTimelineResponse = {
    data: [],
    includes: { media: [], tweets: [], users: [] },
  };

  for (const chunk of chunkArray(Array.from(new Set(postIds)), 100)) {
    if (chunk.length === 0) {
      continue;
    }

    const url = new URL(`${X_API_BASE_URL}/tweets`);
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set("tweet.fields", TWEET_FIELDS);
    url.searchParams.set("expansions", TWEET_DETAIL_EXPANSIONS);
    url.searchParams.set("media.fields", MEDIA_FIELDS);
    url.searchParams.set("user.fields", USER_FIELDS);

    const page = await fetchX<XTimelineResponse>(url, bearerToken);
    mergedResponse.data?.push(
      ...attachHydrationIncludes(page.data ?? [], page.includes),
    );
    mergedResponse.includes?.media?.push(...(page.includes?.media ?? []));
    mergedResponse.includes?.tweets?.push(...(page.includes?.tweets ?? []));
    mergedResponse.includes?.users?.push(...(page.includes?.users ?? []));
    mergedResponse.errors = [
      ...(mergedResponse.errors ?? []),
      ...(page.errors ?? []),
    ];
  }

  return mergedResponse;
}

export async function fetchPostById({
  bearerToken,
  postId,
}: {
  bearerToken: string;
  postId: string;
}) {
  const url = new URL(`${X_API_BASE_URL}/tweets/${postId}`);
  url.searchParams.set("tweet.fields", TWEET_FIELDS);
  url.searchParams.set("expansions", TWEET_DETAIL_EXPANSIONS);
  url.searchParams.set("media.fields", MEDIA_FIELDS);
  url.searchParams.set("user.fields", USER_FIELDS);

  return fetchX<XSinglePostResponse>(url, bearerToken);
}

async function fetchUserPostsPage({
  bearerToken,
  includeReplies,
  userId,
  maxResults,
  paginationToken,
  sinceId,
  startTime,
}: {
  bearerToken: string;
  includeReplies: boolean;
  userId: string;
  maxResults: number;
  paginationToken?: string;
  sinceId?: string;
  startTime?: string;
}) {
  const url = new URL(`${X_API_BASE_URL}/users/${userId}/tweets`);
  url.searchParams.set("max_results", String(maxResults));

  if (!includeReplies) {
    url.searchParams.set("exclude", "replies");
  }

  url.searchParams.set("tweet.fields", TWEET_FIELDS);

  if (sinceId) {
    url.searchParams.set("since_id", sinceId);
  } else if (startTime) {
    url.searchParams.set("start_time", startTime);
  }

  if (paginationToken) {
    url.searchParams.set("pagination_token", paginationToken);
  }

  return fetchX<XTimelineResponse>(url, bearerToken);
}

function attachHydrationIncludes(
  posts: NonNullable<XTimelineResponse["data"]>,
  includes: XIncludes | undefined,
) {
  if (!includes) {
    return posts;
  }

  return posts.map((post) => ({
    ...post,
    hydration_includes: includes,
  }));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
