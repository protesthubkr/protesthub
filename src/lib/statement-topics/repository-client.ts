import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export function getRequiredStatementTopicSupabaseClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}
