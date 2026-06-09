import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramChannelMessage } from "@/lib/telegram/channel-page";
import type { TelegramStatementCandidate } from "./types";

export async function upsertTelegramStatementMessages({
  channelTitle,
  channelUsername,
  dryRun,
  messages,
  supabase,
}: {
  channelTitle: string;
  channelUsername: string;
  dryRun: boolean;
  messages: TelegramChannelMessage[];
  supabase: SupabaseClient;
}) {
  if (messages.length === 0 || dryRun) {
    return 0;
  }

  const now = new Date().toISOString();
  const rows = messages.map((message) => ({
    channel_title: channelTitle,
    channel_username: channelUsername,
    last_seen_at: now,
    message_created_at: message.createdAt,
    message_id: message.messageId,
    raw_payload: {
      image_count: message.imageUrls.length,
      raw_html_length: message.rawHtml.length,
    },
    source_url: message.sourceUrl,
    text_snapshot: message.text,
  }));

  const { data, error } = await supabase
    .from("telegram_statement_messages")
    .upsert(rows, {
      ignoreDuplicates: true,
      onConflict: "channel_username,message_id",
    })
    .select("channel_username,message_id");

  if (error) {
    throw new Error(error.message);
  }

  return ((data as unknown[] | null) ?? []).length;
}

export async function upsertTelegramStatementSummaryCandidates({
  channelTitle,
  channelUsername,
  candidates,
  dryRun,
  supabase,
}: {
  candidates: TelegramStatementCandidate[];
  channelTitle: string;
  channelUsername: string;
  dryRun: boolean;
  supabase: SupabaseClient;
}) {
  if (candidates.length === 0 || dryRun) {
    return 0;
  }

  const now = new Date().toISOString();
  const rows = candidates.map((candidate) => ({
    channel_username: channelUsername,
    detection_reason: candidate.detectionReason,
    document_type: candidate.documentType,
    message_created_at: candidate.message.createdAt,
    message_id: candidate.message.messageId,
    organization_name: channelTitle,
    source_url: candidate.message.sourceUrl,
    status: "pending",
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from("telegram_statement_summaries")
    .upsert(rows, {
      ignoreDuplicates: true,
      onConflict: "channel_username,message_id",
    })
    .select("channel_username,message_id");

  if (error) {
    throw new Error(error.message);
  }

  return ((data as unknown[] | null) ?? []).length;
}
