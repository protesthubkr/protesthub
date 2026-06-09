import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PartyStatementSourceDefinition,
  PartyStatementSourceKey,
} from "./types";

export async function upsertPartyStatementSource({
  source,
  supabase,
}: {
  source: PartyStatementSourceDefinition;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.from("party_statement_sources").upsert(
    {
      enabled: true,
      list_url: source.listUrl,
      organization_name: source.organizationName,
      source_key: source.sourceKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPartyStatementSourceScanFinished({
  errorMessage,
  sourceKey,
  supabase,
}: {
  errorMessage?: string;
  sourceKey: PartyStatementSourceKey;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("party_statement_sources")
    .update({
      last_error: errorMessage ?? null,
      last_scanned_at: now,
      updated_at: now,
    })
    .eq("source_key", sourceKey);

  if (error) {
    throw new Error(error.message);
  }
}
