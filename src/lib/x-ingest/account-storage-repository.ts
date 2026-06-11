import type { SupabaseClient } from "@supabase/supabase-js";
import type { XUser } from "./types";
import type { StoredAccountRow } from "./account-types";

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

export async function markUnfollowedAccounts(
  supabase: SupabaseClient,
  currentFollowingAccountIds: string[],
) {
  const currentFollowingIdSet = new Set(currentFollowingAccountIds);
  const existingFollowingIds = await getStoredFollowingAccountIds(supabase);
  const unfollowedIds = existingFollowingIds.filter(
    (accountId) => !currentFollowingIdSet.has(accountId),
  );

  if (unfollowedIds.length === 0) {
    return 0;
  }

  let updated = 0;
  const now = new Date().toISOString();

  for (const chunk of chunkArray(unfollowedIds, 100)) {
    const { data, error } = await supabase
      .from("x_accounts")
      .update({
        is_following: false,
        last_seen_at: now,
      })
      .in("x_user_id", chunk)
      .select("x_user_id");

    if (error) {
      throw new Error(error.message);
    }

    updated += data?.length ?? 0;
  }

  return updated;
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

export async function getStoredFollowingAccountIds(supabase: SupabaseClient) {
  const accountIds: string[] = [];

  for (let from = 0; ; from += 1000) {
    const to = from + 999;
    const { data, error } = await supabase
      .from("x_accounts")
      .select("x_user_id")
      .eq("is_following", true)
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data as { x_user_id: string }[] | null) ?? [];
    accountIds.push(...rows.map((row) => row.x_user_id));

    if (rows.length < 1000) {
      return accountIds;
    }
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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
