import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicPartyStatementRow } from "./repository-types";

export async function getPublicPartyStatementSummaries({
  limit,
  supabase,
}: {
  limit: number;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("party_statement_summaries")
    .select(
      [
        "id",
        "organization_name",
        "source_url",
        "published_at",
        "document_type",
        "core_sentence",
      ].join(","),
    )
    .eq("status", "extracted")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as PublicPartyStatementRow[] | null) ?? [];
}
