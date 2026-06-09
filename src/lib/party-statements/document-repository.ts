import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartyStatementDocument } from "./types";

export async function upsertPartyStatementDocument({
  document,
  supabase,
}: {
  document: PartyStatementDocument;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const values = {
    document_type: document.documentType,
    external_id: document.externalId,
    last_seen_at: now,
    organization_name: document.organizationName,
    published_at: document.publishedAt,
    raw_payload: {
      rawCategory: document.rawCategory,
      title: document.title,
    },
    source_key: document.sourceKey,
    source_url: document.sourceUrl,
    text_snapshot: document.textSnapshot,
    title: document.title,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("party_statement_documents")
    .upsert(values, {
      onConflict: "source_key,external_id",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to upsert party statement.");
  }

  return data.id as string;
}

export async function getPartyStatementDocumentText({
  documentId,
  supabase,
}: {
  documentId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("party_statement_documents")
    .select("text_snapshot")
    .eq("id", documentId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as { text_snapshot: string }).text_snapshot;
}
