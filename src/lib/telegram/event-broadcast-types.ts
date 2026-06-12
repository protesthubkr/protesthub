import type { PublicEvent } from "@/lib/types";
import type { TelegramBroadcastResult } from "./broadcast";

export const DEFAULT_BROADCAST_LIMIT = 50;

export type TelegramBroadcastBatchOptions = {
  dryRun?: boolean;
  limit?: number;
  targetDate?: string;
};

export type TelegramBroadcastStatus = "pending" | "sent" | "failed";

export type TelegramEventBroadcastRow = {
  id: string;
  event_id: string;
  occurrence_date: string | null;
  channel_id: string;
  status: TelegramBroadcastStatus;
  telegram_message_id: number | null;
  telegram_method: TelegramBroadcastResult["method"] | null;
  payload_hash: string;
  error_message: string | null;
  attempt_count: number;
  locked_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TelegramDailyBroadcastType = "no_events";

export type TelegramDailyBroadcastRow = {
  id: string;
  broadcast_type: TelegramDailyBroadcastType;
  target_date: string;
  channel_id: string;
  status: TelegramBroadcastStatus;
  telegram_message_id: number | null;
  telegram_method: TelegramBroadcastResult["method"] | null;
  payload_hash: string;
  error_message: string | null;
  attempt_count: number;
  locked_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TelegramBroadcastTarget = {
  event: PublicEvent;
  occurrenceDate: string;
};

export type TelegramBroadcastOutcome =
  | {
      eventId: string;
      messageId: number;
      method: TelegramBroadcastResult["method"];
      occurrenceDate: string;
      status: "sent";
    }
  | {
      eventId: string;
      occurrenceDate: string;
      reason: "already_claimed_or_sent";
      status: "skipped";
    }
  | {
      errorMessage: string;
      eventId: string;
      occurrenceDate: string;
      status: "failed";
    }
  | {
      broadcastType: TelegramDailyBroadcastType;
      messageId: number;
      method: TelegramBroadcastResult["method"];
      occurrenceDate: string;
      status: "sent";
    }
  | {
      broadcastType: TelegramDailyBroadcastType;
      occurrenceDate: string;
      reason: "already_claimed_or_sent";
      status: "skipped";
    }
  | {
      broadcastType: TelegramDailyBroadcastType;
      errorMessage: string;
      occurrenceDate: string;
      status: "failed";
    };

export type TelegramBroadcastDryRunOutcome =
  | {
      eventId: string;
      hasPosterImage: boolean;
      message: string;
      method: TelegramBroadcastResult["method"];
      occurrenceDate: string;
      status: "dry_run";
      title: string;
    }
  | {
      broadcastType: TelegramDailyBroadcastType;
      message: string;
      method: TelegramBroadcastResult["method"];
      occurrenceDate: string;
      status: "dry_run";
      title: string;
    };
