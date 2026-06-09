import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isStatementSentencePublishable } from "@/lib/statement-quality/extraction-quality";
import { isMissingTopicGateColumn } from "./repository-utils";
import type {
  PartyTopicSummaryRow,
  TelegramTopicSummaryRow,
} from "./repository-types";

export async function getRecentTelegramTopicSummaries({
  cutoffIso,
  limit,
  supabase,
}: {
  cutoffIso: string;
  limit: number;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("telegram_statement_summaries")
    .select(
      [
        "id",
        "channel_username",
        "organization_name",
        "source_url",
        "message_created_at",
        "document_type",
        "core_sentence",
        "extraction_confidence",
      ].join(","),
    )
    .eq("status", "extracted")
    .not("core_sentence", "is", null)
    .gte("message_created_at", cutoffIso)
    .order("message_created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as unknown as TelegramTopicSummaryRow[] | null) ?? []).filter(
    (row) =>
      row.message_created_at &&
      isStatementSentencePublishable({
        confidence: row.extraction_confidence,
        coreSentence: row.core_sentence,
        documentType: row.document_type,
        sourceType: "telegram",
      }),
  );
}

export async function getRecentPartyTopicSummaries({
  cutoffIso,
  limit,
  supabase,
}: {
  cutoffIso: string;
  limit: number;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("party_statement_summaries")
    .select(
      [
        "id",
        "source_key",
        "organization_name",
        "source_url",
        "title",
        "published_at",
        "document_type",
        "core_sentence",
        "extraction_confidence",
        "topic_gate_status",
      ].join(","),
    )
    .eq("status", "extracted")
    .not("core_sentence", "is", null)
    .gte("published_at", cutoffIso)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    if (isMissingTopicGateColumn(error)) {
      return [] satisfies PartyTopicSummaryRow[];
    }

    throw new Error(error.message);
  }

  return ((data as unknown as PartyTopicSummaryRow[] | null) ?? []).filter(
    (row) =>
      row.published_at &&
      isStatementSentencePublishable({
        confidence: row.extraction_confidence,
        coreSentence: row.core_sentence,
        documentType: row.document_type,
        sourceType: "party",
      }),
  );
}
