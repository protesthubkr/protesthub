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

export async function getPreviousSuccessfulIngestStartedAt(
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase
    .from("x_ingest_runs")
    .select("started_at")
    .eq("strategy", INGEST_STRATEGY)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return formatXApiStartTime(data?.started_at);
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

export async function getLatestSeenPostId(
  supabase: SupabaseClient,
  accountId: string,
) {
  const { data, error } = await supabase
    .from("x_posts")
    .select("x_post_id")
    .eq("author_x_user_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.x_post_id as string | undefined;
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
  if (posts.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from("x_posts")
    .upsert(
      posts.map((post) => ({
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

  return data?.length ?? posts.length;
}

export async function upsertPostMedia(
  supabase: SupabaseClient,
  posts: XPost[],
) {
  const rows = posts.flatMap((post) =>
    (post.attachments?.media_keys ?? []).map((mediaKey, index) => ({
      x_post_id: post.id,
      media_key: mediaKey,
      media_order: index,
    })),
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
  if (rows.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from("x_event_candidates")
    .upsert(rows, {
      onConflict: "x_post_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? rows.length;
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
