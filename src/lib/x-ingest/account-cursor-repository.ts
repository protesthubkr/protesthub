import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountCursorRow,
  AccountIngestCursor,
  AccountIngestCursorUpdate,
  ExistingAccountUpsertRow,
  LatestPostCursorRow,
  PostCursor,
} from "./account-types";

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
}: AccountIngestCursorUpdate & {
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

export async function updateAccountIngestCursors(
  supabase: SupabaseClient,
  updates: AccountIngestCursorUpdate[],
) {
  if (updates.length === 0) {
    return;
  }

  const existingAccounts = await getExistingAccountsForCursorUpdate(
    supabase,
    updates.map((update) => update.accountId),
  );
  const accountsById = new Map(
    existingAccounts.map((account) => [account.x_user_id, account]),
  );

  const { error } = await supabase.from("x_accounts").upsert(
    updates.map((update) => {
      const account = accountsById.get(update.accountId);

      if (!account) {
        throw new Error(
          `X account not found for cursor update: ${update.accountId}`,
        );
      }

      const values: Record<string, unknown> = {
        x_user_id: update.accountId,
        account_name: account.account_name,
        last_ingested_at: update.checkedAt,
        last_ingest_run_id: update.runId,
        last_seen_at: update.checkedAt,
        raw_payload: account.raw_payload,
        username: account.username,
      };

      if (update.latestPost) {
        values.last_ingested_post_id = update.latestPost.postId;
        values.last_ingested_post_created_at = update.latestPost.createdAt;
      }

      return values;
    }),
    { onConflict: "x_user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function getExistingAccountsForCursorUpdate(
  supabase: SupabaseClient,
  accountIds: string[],
) {
  const { data, error } = await supabase
    .from("x_accounts")
    .select("x_user_id,username,account_name,raw_payload")
    .in("x_user_id", accountIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data as ExistingAccountUpsertRow[] | null) ?? [];
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
