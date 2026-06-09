import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { TelegramBroadcastResult } from "./broadcast";
import type { TelegramEventBroadcastRow } from "./event-broadcast-types";

export function getRequiredSupabaseAdminClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

export function getTelegramBroadcastChannelId() {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!channelId) {
    throw new Error("TELEGRAM_CHANNEL_ID is not configured.");
  }

  return channelId;
}

export async function claimTelegramEventBroadcast(
  supabase: SupabaseClient,
  {
    channelId,
    eventId,
    occurrenceDate,
    payloadHash,
  }: {
    channelId: string;
    eventId: string;
    occurrenceDate: string;
    payloadHash: string;
  },
) {
  const { data, error } = await supabase.rpc(
    "claim_telegram_event_broadcast",
    {
      p_channel_id: channelId,
      p_event_id: eventId,
      p_occurrence_date: occurrenceDate,
      p_payload_hash: payloadHash,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data as TelegramEventBroadcastRow | null;
}

export async function markTelegramEventBroadcastSent(
  supabase: SupabaseClient,
  {
    broadcastId,
    result,
  }: {
    broadcastId: string;
    result: TelegramBroadcastResult;
  },
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("telegram_event_broadcasts")
    .update({
      error_message: null,
      locked_at: null,
      sent_at: now,
      status: "sent",
      telegram_message_id: result.messageId,
      telegram_method: result.method,
      updated_at: now,
    })
    .eq("id", broadcastId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markTelegramEventBroadcastFailed(
  supabase: SupabaseClient,
  {
    broadcastId,
    errorMessage,
  }: {
    broadcastId: string;
    errorMessage: string;
  },
) {
  const { error } = await supabase
    .from("telegram_event_broadcasts")
    .update({
      error_message: errorMessage,
      locked_at: null,
      status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", broadcastId);

  if (error) {
    throw new Error(error.message);
  }
}
