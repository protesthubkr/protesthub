import { isStatementSentencePublishable } from "@/lib/statement-quality/extraction-quality";
import { getSupabaseClient } from "@/lib/supabase";
import {
  resolvePartyStatementDisplayTimestamp,
} from "./public-feed-time";
import type {
  PartyStatementSummaryPublicRow,
  PublicStatementFeedItem,
  StatementSummaryPublicRow,
} from "./public-feed-types";

export async function getPublicTelegramStatementItems(limit: number) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [] satisfies PublicStatementFeedItem[];
  }

  const { data, error } = await supabase
    .from("telegram_statement_summaries")
    .select(
      [
        "id",
        "organization_name",
        "source_url",
        "message_created_at",
        "document_type",
        "core_sentence",
        "extraction_confidence",
      ].join(","),
    )
    .eq("status", "extracted")
    .order("message_created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as unknown as StatementSummaryPublicRow[] | null) ?? [])
    .filter((row) =>
      isStatementSentencePublishable({
        confidence: row.extraction_confidence,
        coreSentence: row.core_sentence,
        documentType: row.document_type,
        sourceType: "telegram",
      }),
    )
    .map((row) => ({
      coreSentence: normalizeFeedSentence(row.core_sentence),
      documentType: row.document_type,
      id: `telegram:${row.id}`,
      isTimeUnknown: false,
      messageCreatedAt: row.message_created_at,
      organizationName: row.organization_name,
      sourceUrl: row.source_url,
      sourceType: "telegram" as const,
    }));
}

export async function getPublicPartyStatementItems(limit: number) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [] satisfies PublicStatementFeedItem[];
  }

  const { data, error } = await supabase
    .from("party_statement_summaries")
    .select(
      [
        "id",
        "organization_name",
        "source_url",
        "published_at",
        "created_at",
        "document_type",
        "core_sentence",
        "extraction_confidence",
        "topic_gate_status",
      ].join(","),
    )
    .eq("status", "extracted")
    .in("topic_gate_status", ["matched", "manual_matched"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    if (isMissingPartyStatementTable(error)) {
      return [] satisfies PublicStatementFeedItem[];
    }

    throw new Error(error.message);
  }

  return ((data as unknown as PartyStatementSummaryPublicRow[] | null) ?? [])
    .filter((row) =>
      isStatementSentencePublishable({
        confidence: row.extraction_confidence,
        coreSentence: row.core_sentence,
        documentType: row.document_type,
        sourceType: "party",
      }),
    )
    .map((row) => {
      const resolvedTimestamp = resolvePartyStatementDisplayTimestamp({
        collectedAt: row.created_at,
        publishedAt: row.published_at,
      });

      return {
        coreSentence: normalizeFeedSentence(row.core_sentence),
        documentType: row.document_type,
        id: `party:${row.id}`,
        isTimeUnknown: !resolvedTimestamp,
        messageCreatedAt: resolvedTimestamp ?? row.published_at,
        organizationName: row.organization_name,
        sourceUrl: row.source_url,
        sourceType: "party" as const,
      };
    });
}

function isMissingPartyStatementTable(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    /party_statement_summaries/i.test(error.message ?? "")
  );
}

function normalizeFeedSentence(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
