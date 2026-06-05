import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getXIngestConfig, XIngestConfigError } from "./config";
import {
  getCandidateReasons,
  getMediaForPost,
  getPostUrl,
  shouldCreateCandidate,
} from "./normalize";
import type { XIngestResult, XMedia, XPost, XUser } from "./types";
import { fetchFollowingAccounts, fetchUserPosts, XApiError } from "./x-api";

export { XApiError, XIngestConfigError };

const INGEST_STRATEGY = "following_user_timelines";

type IngestCounters = {
  accountsSeen: number;
  postsSeen: number;
  postsWritten: number;
  candidatesCreated: number;
};

export async function runXIngest(): Promise<XIngestResult> {
  const config = getXIngestConfig();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const missingKeys: string[] = [];

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      missingKeys.push("NEXT_PUBLIC_SUPABASE_URL");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      missingKeys.push("SUPABASE_SERVICE_ROLE_KEY");
    }

    throw new XIngestConfigError(missingKeys);
  }

  const runId = await createIngestRun(supabase, {
    postsPerAccount: config.postsPerAccount,
    maxFollowingAccounts: config.maxFollowingAccounts,
  });

  const counters: IngestCounters = {
    accountsSeen: 0,
    postsSeen: 0,
    postsWritten: 0,
    candidatesCreated: 0,
  };

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
      const sinceId = await getLatestSeenPostId(supabase, account.id);
      const timeline = await fetchUserPosts({
        bearerToken: config.bearerToken,
        userId: account.id,
        maxResults: config.postsPerAccount,
        sinceId,
      });
      const posts = timeline.data ?? [];
      const media = timeline.includes?.media ?? [];
      const mediaByKey = new Map(media.map((item) => [item.media_key, item]));

      counters.postsSeen += posts.length;
      await upsertMedia(supabase, media);
      counters.postsWritten += await upsertPosts(
        supabase,
        runId,
        account,
        posts,
      );
      await upsertPostMedia(supabase, posts);
      counters.candidatesCreated += await createCandidates(
        supabase,
        account,
        posts,
        mediaByKey,
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

async function createIngestRun(
  supabase: SupabaseClient,
  metadata: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("x_ingest_runs")
    .insert({
      status: "running",
      strategy: INGEST_STRATEGY,
      metadata,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to create X ingest run");
  }

  return data.id as string;
}

async function finishIngestRun(
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

async function upsertAccounts(supabase: SupabaseClient, accounts: XUser[]) {
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

async function getLatestSeenPostId(supabase: SupabaseClient, accountId: string) {
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

async function upsertMedia(supabase: SupabaseClient, media: XMedia[]) {
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

async function upsertPosts(
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
        text: post.text ?? "",
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

async function upsertPostMedia(supabase: SupabaseClient, posts: XPost[]) {
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

async function createCandidates(
  supabase: SupabaseClient,
  account: XUser,
  posts: XPost[],
  mediaByKey: Map<string, XMedia>,
) {
  const rows = posts.flatMap((post) => {
    const media = getMediaForPost(post, mediaByKey);

    if (!shouldCreateCandidate(post, media)) {
      return [];
    }

    return [
      {
        x_post_id: post.id,
        source_account_name: account.name,
        source_post_url: getPostUrl(account, post),
        text_snapshot: post.text ?? "",
        media_keys: media.map((item) => item.media_key),
        extraction_payload: {
          source: "x_ingest_heuristic_v1",
          needs_ocr: media.length > 0,
          quoted_post_ids:
            post.referenced_tweets
              ?.filter((reference) => reference.type === "quoted")
              .map((reference) => reference.id) ?? [],
          replied_to_post_ids:
            post.referenced_tweets
              ?.filter((reference) => reference.type === "replied_to")
              .map((reference) => reference.id) ?? [],
        },
        candidate_reason: getCandidateReasons(post, media),
      },
    ];
  });

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
