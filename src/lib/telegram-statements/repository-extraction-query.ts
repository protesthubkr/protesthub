import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeStatementDocumentType } from "./repository-document-type";
import type {
  PendingStatementSummaryRow,
  StatementMessageTextRow,
  StatementSummaryForExtractionRow,
} from "./repository-extraction-types";

const SUMMARY_BASE_SELECT = [
  "id",
  "channel_username",
  "message_id",
  "organization_name",
  "source_url",
  "message_created_at",
  "document_type",
  "attempt_count",
].join(",");

export async function getPendingStatementSummaries({
  createdAfterIso,
  limit,
  summaryId,
  supabase,
}: {
  createdAfterIso?: string | null;
  limit: number;
  summaryId?: string;
  supabase: SupabaseClient;
}) {
  let query = supabase
    .from("telegram_statement_summaries")
    .select(SUMMARY_BASE_SELECT)
    .eq("status", "pending")
    .order("message_created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (summaryId) {
    query = query.eq("id", summaryId);
  }

  if (createdAfterIso) {
    query = query.gte("message_created_at", createdAfterIso);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data as unknown as PendingStatementSummaryRow[] | null) ?? []).map(
    (row) => ({
      ...row,
      document_type: normalizeStatementDocumentType(row.document_type),
    }),
  );
}

export async function getStatementSummaryForExtraction({
  summaryId,
  supabase,
}: {
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("telegram_statement_summaries")
    .select(
      [
        SUMMARY_BASE_SELECT,
        "status",
        "batch_id",
        "batch_custom_id",
      ].join(","),
    )
    .eq("id", summaryId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as StatementSummaryForExtractionRow;

  return {
    ...row,
    document_type: normalizeStatementDocumentType(row.document_type),
  };
}

export async function getTelegramStatementMessageText({
  channelUsername,
  messageId,
  supabase,
}: {
  channelUsername: string;
  messageId: number;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("telegram_statement_messages")
    .select("channel_username,message_id,text_snapshot")
    .eq("channel_username", channelUsername)
    .eq("message_id", messageId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as StatementMessageTextRow | null;
}
