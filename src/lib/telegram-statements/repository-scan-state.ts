import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramChannelMessage } from "@/lib/telegram/channel-page";
import type { TelegramStatementScanState } from "./types";
import type { StatementScanStateRow } from "./repository-scan-types";

export async function getTelegramStatementScanState({
  channelUsername,
  supabase,
}: {
  channelUsername: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("telegram_statement_scan_states")
    .select(
      [
        "channel_username",
        "last_scanned_at",
        "last_scanned_message_at",
        "last_scanned_message_id",
        "locked_at",
      ].join(","),
    )
    .eq("channel_username", channelUsername)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapStateRow(data as unknown as StatementScanStateRow) : null;
}

export async function lockTelegramStatementScanState({
  channelUsername,
  dryRun,
  supabase,
}: {
  channelUsername: string;
  dryRun: boolean;
  supabase: SupabaseClient;
}) {
  if (dryRun) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("telegram_statement_scan_states")
    .upsert(
      {
        channel_username: channelUsername,
        last_error: null,
        locked_at: now,
        updated_at: now,
      },
      { onConflict: "channel_username" },
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function markTelegramStatementScanSucceeded({
  channelUsername,
  cursorMessage,
  dryRun,
  supabase,
}: {
  channelUsername: string;
  cursorMessage: Pick<TelegramChannelMessage, "createdAt" | "messageId"> | null;
  dryRun: boolean;
  supabase: SupabaseClient;
}) {
  if (dryRun) {
    return;
  }

  const now = new Date().toISOString();
  const values: Record<string, unknown> = {
    channel_username: channelUsername,
    last_error: null,
    last_scanned_at: now,
    locked_at: null,
    updated_at: now,
  };

  if (cursorMessage) {
    values.last_scanned_message_id = cursorMessage.messageId;
    values.last_scanned_message_at = cursorMessage.createdAt;
  }

  const { error } = await supabase
    .from("telegram_statement_scan_states")
    .upsert(values, { onConflict: "channel_username" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function markTelegramStatementScanFailed({
  channelUsername,
  dryRun,
  error,
  supabase,
}: {
  channelUsername: string;
  dryRun: boolean;
  error: unknown;
  supabase: SupabaseClient;
}) {
  if (dryRun) {
    return;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("telegram_statement_scan_states")
    .upsert(
      {
        channel_username: channelUsername,
        last_error: error instanceof Error ? error.message : String(error),
        locked_at: null,
        updated_at: now,
      },
      { onConflict: "channel_username" },
    );

  if (updateError) {
    throw new Error(updateError.message);
  }
}

function mapStateRow(row: StatementScanStateRow): TelegramStatementScanState {
  return {
    channelUsername: row.channel_username,
    lastScannedAt: row.last_scanned_at,
    lastScannedMessageAt: row.last_scanned_message_at,
    lastScannedMessageId: row.last_scanned_message_id,
    lockedAt: row.locked_at,
  };
}
