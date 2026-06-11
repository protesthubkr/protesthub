export const TELEGRAM_CHANNEL_SCAN_SOURCE =
  "telegram_channel_subscription_scan";

export const NEW_CHANNEL_LOOKBACK_DAYS = 60;

export const TELEGRAM_CHANNEL_SUBSCRIPTION_SELECT = [
  "id",
  "channel_username",
  "channel_title",
  "source_url",
  "status",
  "last_checked_at",
  "last_checked_message_id",
  "last_checked_message_at",
  "last_scan_started_at",
  "last_scan_finished_at",
  "last_scan_error",
  "created_at",
  "updated_at",
].join(",");

export type TelegramChannelSubscriptionStatus = "active" | "paused";

export type TelegramChannelSubscription = {
  id: string;
  channelTitle: string;
  channelUsername: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastCheckedMessageAt: string | null;
  lastCheckedMessageId: number | null;
  lastScanError: string | null;
  lastScanFinishedAt: string | null;
  lastScanStartedAt: string | null;
  sourceUrl: string;
  status: TelegramChannelSubscriptionStatus;
  updatedAt: string;
};

export type TelegramChannelScanResult = {
  candidatesCreated: number;
  candidatesPromoted: number;
  candidatesRefreshed: number;
  channelsScanned: number;
  ignoredCreated: number;
  messagesSeen: number;
  needsReviewCreated: number;
};

export type TelegramChannelCandidateInsertResult = {
  candidatesCreated: number;
  candidatesPromoted: number;
  candidatesRefreshed: number;
  ignoredCreated: number;
  needsReviewCreated: number;
};

export type TelegramChannelCursorMessage = {
  createdAt: string | null;
  messageId: number;
};

export type TelegramSubscriptionRow = {
  id: string;
  channel_title: string | null;
  channel_username: string;
  created_at: string;
  last_checked_at: string | null;
  last_checked_message_at: string | null;
  last_checked_message_id: number | null;
  last_scan_error: string | null;
  last_scan_finished_at: string | null;
  last_scan_started_at: string | null;
  source_url: string;
  status: TelegramChannelSubscriptionStatus;
  updated_at: string;
};

export function mapTelegramSubscriptionRow(
  row: TelegramSubscriptionRow,
): TelegramChannelSubscription {
  return {
    id: row.id,
    channelTitle: row.channel_title ?? `@${row.channel_username}`,
    channelUsername: row.channel_username,
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    lastCheckedMessageAt: row.last_checked_message_at,
    lastCheckedMessageId: row.last_checked_message_id,
    lastScanError: row.last_scan_error,
    lastScanFinishedAt: row.last_scan_finished_at,
    lastScanStartedAt: row.last_scan_started_at,
    sourceUrl: row.source_url,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function isMissingTelegramSubscriptionTableError(error: {
  code?: string;
}) {
  return error.code === "42P01" || error.code === "PGRST205";
}
