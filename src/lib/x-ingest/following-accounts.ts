import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertAccounts } from "./repository";
import { fetchFollowingAccounts } from "./x-api";

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
  const followingAccounts = await fetchFollowingAccounts({
    bearerToken,
    operatingUserId,
    maxAccounts,
  });

  await upsertAccounts(supabase, followingAccounts);

  return followingAccounts.filter((account) => !account.protected);
}
