import type { SupabaseClient } from "@supabase/supabase-js";
import { getPostText, getPostUrl } from "./normalize-text";
import { dedupePostsById } from "./repository-utils";
import type { XPost, XUser } from "./types";

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

  const existingPostIds = await getExistingPostIds(
    supabase,
    uniquePosts.map((post) => post.id),
  );
  const newPosts = uniquePosts.filter((post) => !existingPostIds.has(post.id));
  const existingPosts = uniquePosts.filter((post) =>
    existingPostIds.has(post.id),
  );
  const inserted = await insertNewPosts(supabase, runId, account, newPosts);

  await updateExistingPosts(supabase, account, existingPosts);

  return inserted;
}

async function getExistingPostIds(supabase: SupabaseClient, postIds: string[]) {
  if (postIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("x_posts")
    .select("x_post_id")
    .in("x_post_id", postIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    ((data as { x_post_id: string }[] | null) ?? []).map(
      (row) => row.x_post_id,
    ),
  );
}

async function insertNewPosts(
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
      posts.map((post) => buildPostUpsertRow(account, post, runId)),
      { ignoreDuplicates: true, onConflict: "x_post_id" },
    )
    .select("x_post_id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

async function updateExistingPosts(
  supabase: SupabaseClient,
  account: XUser,
  posts: XPost[],
) {
  if (posts.length === 0) {
    return;
  }

  const { error } = await supabase.from("x_posts").upsert(
    posts.map((post) => buildPostUpsertRow(account, post)),
    { onConflict: "x_post_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

function buildPostUpsertRow(
  account: XUser,
  post: XPost,
  firstSeenRunId?: string,
) {
  return {
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
    ...(firstSeenRunId ? { first_seen_ingest_run_id: firstSeenRunId } : {}),
    last_seen_at: new Date().toISOString(),
  };
}
