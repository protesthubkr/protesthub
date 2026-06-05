import type { XFollowingResponse, XTimelineResponse, XUser } from "./types";

const X_API_BASE_URL = "https://api.x.com/2";

const USER_FIELDS = [
  "created_at",
  "description",
  "location",
  "name",
  "profile_image_url",
  "protected",
  "public_metrics",
  "verified",
  "verified_type",
  "username",
].join(",");

const TWEET_FIELDS = [
  "attachments",
  "author_id",
  "conversation_id",
  "created_at",
  "edit_history_tweet_ids",
  "entities",
  "note_tweet",
  "referenced_tweets",
  "text",
].join(",");

const TWEET_EXPANSIONS = [
  "attachments.media_keys",
  "author_id",
  "referenced_tweets.id",
  "referenced_tweets.id.author_id",
  "referenced_tweets.id.attachments.media_keys",
].join(",");

const MEDIA_FIELDS = [
  "alt_text",
  "height",
  "media_key",
  "preview_image_url",
  "type",
  "url",
  "width",
].join(",");

export class XApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`X API request failed with status ${status}`);
  }
}

export async function fetchFollowingAccounts({
  bearerToken,
  operatingUserId,
  maxAccounts,
}: {
  bearerToken: string;
  operatingUserId: string;
  maxAccounts: number;
}) {
  const accounts: XUser[] = [];
  let paginationToken: string | undefined;

  while (accounts.length < maxAccounts) {
    const url = new URL(
      `${X_API_BASE_URL}/users/${operatingUserId}/following`,
    );
    url.searchParams.set("max_results", "1000");
    url.searchParams.set("user.fields", USER_FIELDS);

    if (paginationToken) {
      url.searchParams.set("pagination_token", paginationToken);
    }

    const page = await fetchX<XFollowingResponse>(url, bearerToken);
    accounts.push(...(page.data ?? []));

    if (!page.meta?.next_token) {
      break;
    }

    paginationToken = page.meta.next_token;
  }

  return accounts.slice(0, maxAccounts);
}

export async function fetchUserPosts({
  bearerToken,
  includeReplies,
  userId,
  maxResults,
  sinceId,
  startTime,
}: {
  bearerToken: string;
  includeReplies: boolean;
  userId: string;
  maxResults: number;
  sinceId?: string;
  startTime?: string;
}) {
  const url = new URL(`${X_API_BASE_URL}/users/${userId}/tweets`);
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set(
    "exclude",
    includeReplies ? "retweets" : "retweets,replies",
  );
  url.searchParams.set("tweet.fields", TWEET_FIELDS);
  url.searchParams.set("expansions", TWEET_EXPANSIONS);
  url.searchParams.set("media.fields", MEDIA_FIELDS);
  url.searchParams.set("user.fields", USER_FIELDS);

  if (sinceId) {
    url.searchParams.set("since_id", sinceId);
  } else if (startTime) {
    url.searchParams.set("start_time", startTime);
  }

  return fetchX<XTimelineResponse>(url, bearerToken);
}

async function fetchX<T>(url: URL, bearerToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new XApiError(response.status, await readJsonSafely(response));
  }

  return (await response.json()) as T;
}

async function readJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
