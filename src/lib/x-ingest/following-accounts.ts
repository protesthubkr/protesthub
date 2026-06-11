import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markUnfollowedAccounts,
  upsertAccounts,
} from "./account-storage-repository";
import { fetchFollowingAccounts } from "./x-api-following";

export async function refreshFollowingAccounts({
  bearerToken,
  maxAccounts,
  operatingUserId,
  supabase,
}: {
  bearerToken: string;
  maxAccounts: number;
  operatingUserId: string;
  supabase: SupabaseClient;
}) {
  const followingFetch = await fetchFollowingAccounts({
    bearerToken,
    operatingUserId,
    maxAccounts,
  });
  const followingAccounts = followingFetch.accounts;

  await upsertAccounts(supabase, followingAccounts);

  if (followingFetch.fullyFetched) {
    await markUnfollowedAccounts(
      supabase,
      followingAccounts.map((account) => account.id),
    );
  }

  return followingAccounts.filter((account) => !account.protected);
}
