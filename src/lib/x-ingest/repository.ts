import type { SupabaseClient } from "@supabase/supabase-js";
import { getPostText, getPostUrl } from "./normalize";
import type { XMedia, XPost, XUser } from "./types";
import type { XEventCandidateInsertRow } from "./candidate-rows";

const INGEST_STRATEGY = "following_user_timelines";

export type IngestCounters = {
  accountsSeen: number;
  postsSeen: number;
  postsWritten: number;
  candidatesCreated: number;
};

export type AccountIngestCursor = {
  lastIngestedAt?: string;
  lastIngestedPostCreatedAt?: string;
  sinceId?: string;
  source: "account_cursor" | "latest_saved_post" | "none";
  startTime?: string;
};

export type PostCursor = {
  createdAt: string;
  postId: string;
};

type AccountCursorRow = {
  last_ingested_at: string | null;
  last_ingested_post_created_at: string | null;
  last_ingested_post_id: string | null;
};

type StoredAccountRow = {
  account_name: string;
  is_protected: boolean;
  is_verified: boolean | null;
  raw_payload: unknown;
  username: string;
  x_user_id: string;
};

type LatestPostCursorRow = {
  created_at: string | null;
  x_post_id: string;
};

type PostAttachmentMediaKeysRow = {
  attachment_media_keys: string[] | null;
  x_post_id: string;
};

export function createEmptyIngestCounters(): IngestCounters {
  return {
    accountsSeen: 0,
    postsSeen: 0,
    postsWritten: 0,
    candidatesCreated: 0,
  };
}

export async function createIngestRun(
  supabase: SupabaseClient,
  metadata: Record<string, unknown>,
  strategy = INGEST_STRATEGY,
) {
  const { data, error } = await supabase
    .from("x_ingest_runs")
    .insert({
      status: "running",
      strategy,
      metadata,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to create X ingest run");
  }

  return data.id as string;
}

export async function finishIngestRun(
  supabase: SupabaseClient,
  runId: string,
  status: "succeeded" | "failed",
  counters: IngestCounters,
  error?: unknown,
) {
  const { error: updateError } = await supabase
    .from("x_ingest_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      accounts_seen: counters.accountsSeen,
      posts_seen: counters.postsSeen,
      posts_written: counters.postsWritten,
      candidates_created: counters.candidatesCreated,
      error_message: error ? formatError(error) : null,
    })
    .eq("id", runId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function upsertAccounts(
  supabase: SupabaseClient,
  accounts: XUser[],
) {
  if (accounts.length === 0) {
    return;
  }

  const { error } = await supabase.from("x_accounts").upsert(
    accounts.map((account) => ({
      x_user_id: account.id,
      username: account.username,
      account_name: account.name,
      is_following: true,
      is_protected: account.protected ?? false,
      is_verified: account.verified ?? null,
      last_seen_at: new Date().toISOString(),
      raw_payload: account,
    })),
    { onConflict: "x_user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function insertDiscoveredAccounts(
  supabase: SupabaseClient,
  accounts: XUser[],
) {
  const uniqueAccounts = Array.from(
    new Map(accounts.map((account) => [account.id, account])).values(),
  );

  if (uniqueAccounts.length === 0) {
    return;
  }

  const { error } = await supabase.from("x_accounts").upsert(
    uniqueAccounts.map((account) => ({
      x_user_id: account.id,
      username: account.username,
      account_name: account.name,
      is_following: false,
      is_protected: account.protected ?? false,
      is_verified: account.verified ?? null,
      last_seen_at: new Date().toISOString(),
      raw_payload: account,
    })),
    {
      ignoreDuplicates: true,
      onConflict: "x_user_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCollectibleStoredAccounts(
  supabase: SupabaseClient,
  maxAccounts: number,
) {
  const { data, error } = await supabase
    .from("x_accounts")
    .select(
      "x_user_id,username,account_name,is_protected,is_verified,raw_payload",
    )
    .eq("is_following", true)
    .eq("is_protected", false)
    .order("last_ingested_at", { ascending: true, nullsFirst: true })
    .order("account_name", { ascending: true })
    .limit(maxAccounts);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as StoredAccountRow[] | null) ?? []).map((row) => ({
    id: row.x_user_id,
    username: row.username,
    name: row.account_name,
    protected: row.is_protected,
    verified: row.is_verified ?? undefined,
    raw: row.raw_payload,
  })) satisfies XUser[];
}

export async function getAccountIngestCursor(
  supabase: SupabaseClient,
  accountId: string,
) {
  const { data: accountData, error: accountError } = await supabase
    .from("x_accounts")
    .select(
      "last_ingested_at,last_ingested_post_id,last_ingested_post_created_at",
    )
    .eq("x_user_id", accountId)
    .maybeSingle();

  if (accountError) {
    throw new Error(accountError.message);
  }

  const accountCursor = accountData as AccountCursorRow | null;
  const accountPostCursor = createPostCursor({
    created_at: accountCursor?.last_ingested_post_created_at ?? null,
    x_post_id: accountCursor?.last_ingested_post_id ?? "",
  });

  if (accountPostCursor) {
    return {
      lastIngestedAt: formatXApiStartTime(accountCursor?.last_ingested_at),
      lastIngestedPostCreatedAt: accountPostCursor.createdAt,
      sinceId: accountPostCursor.postId,
      source: "account_cursor",
    } satisfies AccountIngestCursor;
  }

  const accountStartTime = formatXApiStartTime(
    accountCursor?.last_ingested_at,
  );

  if (accountStartTime) {
    return {
      lastIngestedAt: accountStartTime,
      source: "account_cursor",
      startTime: accountStartTime,
    } satisfies AccountIngestCursor;
  }

  const latestSavedPost = await getLatestSavedPostCursor(supabase, accountId);

  if (latestSavedPost) {
    return {
      lastIngestedPostCreatedAt: latestSavedPost.createdAt,
      sinceId: latestSavedPost.postId,
      source: "latest_saved_post",
    } satisfies AccountIngestCursor;
  }

  return { source: "none" } satisfies AccountIngestCursor;
}

export async function updateAccountIngestCursor({
  accountId,
  checkedAt,
  latestPost,
  runId,
  supabase,
}: {
  accountId: string;
  checkedAt: string;
  latestPost?: PostCursor;
  runId: string;
  supabase: SupabaseClient;
}) {
  const values: Record<string, unknown> = {
    last_ingested_at: checkedAt,
    last_ingest_run_id: runId,
    last_seen_at: checkedAt,
  };

  if (latestPost) {
    values.last_ingested_post_id = latestPost.postId;
    values.last_ingested_post_created_at = latestPost.createdAt;
  }

  const { error } = await supabase
    .from("x_accounts")
    .update(values)
    .eq("x_user_id", accountId);

  if (error) {
    throw new Error(error.message);
  }
}

async function getLatestSavedPostCursor(
  supabase: SupabaseClient,
  accountId: string,
) {
  const { data, error } = await supabase
    .from("x_posts")
    .select("x_post_id,created_at")
    .eq("author_x_user_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return createPostCursor((data as LatestPostCursorRow | null) ?? null);
}

export async function getAttachmentMediaKeysByPostId(
  supabase: SupabaseClient,
  postIds: string[],
) {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));

  if (uniquePostIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data, error } = await supabase
    .from("x_posts")
    .select("x_post_id,attachment_media_keys")
    .in("x_post_id", uniquePostIds);

  if (error || !data) {
    return new Map<string, string[]>();
  }

  return new Map(
    (data as unknown as PostAttachmentMediaKeysRow[]).map((row) => [
      row.x_post_id,
      row.attachment_media_keys ?? [],
    ]),
  );
}

export async function upsertMedia(
  supabase: SupabaseClient,
  media: XMedia[],
) {
  if (media.length === 0) {
    return;
  }

  const { error } = await supabase.from("x_media").upsert(
    media.map((item) => ({
      media_key: item.media_key,
      media_type: item.type,
      url: item.url ?? null,
      preview_image_url: item.preview_image_url ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      alt_text: item.alt_text ?? null,
      raw_payload: item,
      last_seen_at: new Date().toISOString(),
    })),
    { onConflict: "media_key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertPosts(
  supabase: SupabaseClient,
  runId: string,
  account: XUser,
  posts: XPost[],
) {
  const uniquePosts = dedupePostsById(posts);

  if (uniquePosts.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from("x_posts")
    .upsert(
      uniquePosts.map((post) => ({
        x_post_id: post.id,
        author_x_user_id: post.author_id ?? account.id,
        text: getPostText(post),
        created_at: post.created_at ?? null,
        conversation_id: post.conversation_id ?? null,
        source_post_url: getPostUrl(account, post),
        referenced_posts: post.referenced_tweets ?? [],
        edit_history_post_ids: post.edit_history_tweet_ids ?? [post.id],
        attachment_media_keys: post.attachments?.media_keys ?? [],
        entities: post.entities ?? {},
        raw_payload: post,
        first_seen_ingest_run_id: runId,
        last_seen_at: new Date().toISOString(),
      })),
      { onConflict: "x_post_id" },
    )
    .select("x_post_id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? uniquePosts.length;
}

export async function upsertPostMedia(
  supabase: SupabaseClient,
  posts: XPost[],
  knownMediaKeys?: Set<string>,
) {
  const rows = Array.from(
    new Map(
      dedupePostsById(posts)
        .flatMap((post) =>
          (post.attachments?.media_keys ?? [])
            .filter((mediaKey) => !knownMediaKeys || knownMediaKeys.has(mediaKey))
            .map((mediaKey, index) => ({
              x_post_id: post.id,
              media_key: mediaKey,
              media_order: index,
            })),
        )
        .map((row) => [`${row.x_post_id}:${row.media_key}`, row]),
    ).values(),
  );

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("x_post_media")
    .upsert(rows, { onConflict: "x_post_id,media_key" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function insertCandidateRows(
  supabase: SupabaseClient,
  rows: XEventCandidateInsertRow[],
) {
  const uniqueRows = Array.from(
    new Map(rows.map((row) => [row.x_post_id, row])).values(),
  );

  if (uniqueRows.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from("x_event_candidates")
    .upsert(uniqueRows, {
      onConflict: "x_post_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? uniqueRows.length;
}

function dedupePostsById(posts: XPost[]) {
  return Array.from(new Map(posts.map((post) => [post.id, post])).values());
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatXApiStartTime(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
}

function createPostCursor(row: LatestPostCursorRow | null) {
  if (!row?.x_post_id) {
    return undefined;
  }

  const createdAt = formatXApiStartTime(row.created_at);

  if (!createdAt) {
    return undefined;
  }

  return {
    createdAt,
    postId: row.x_post_id,
  } satisfies PostCursor;
}
