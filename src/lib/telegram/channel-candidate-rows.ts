import type { TelegramChannelMessage } from "./channel-page";
import { evaluateTelegramCandidate } from "./channel-candidate-evaluation";
import {
  createTelegramMediaKey,
  createTelegramSourceRecordId,
} from "./channel-candidate-keys";
import {
  TELEGRAM_CHANNEL_SCAN_SOURCE,
  type TelegramChannelSubscription,
} from "./channel-subscription-types";

export type TelegramCandidateInsertRow = {
  extraction_payload: Record<string, unknown>;
  media_keys: string[];
  review_reason: string[];
  source_name: string;
  source_record_id: string;
  source_type: "telegram";
  source_url: string;
  status: "needs_review" | "ignored";
  text_snapshot: string;
  updated_at: string;
};

export function createTelegramCandidateRows({
  channelTitle,
  message,
  subscription,
}: {
  channelTitle: string;
  message: TelegramChannelMessage;
  subscription: TelegramChannelSubscription;
}): TelegramCandidateInsertRow[] {
  const sourceRecordId = createTelegramSourceRecordId(
    subscription.channelUsername,
    message.messageId,
  );
  const mediaKeys = message.imageUrls.map((_imageUrl, index) =>
    createTelegramMediaKey(
      subscription.channelUsername,
      message.messageId,
      index,
    ),
  );
  const decision = evaluateTelegramCandidate({
    channelTitle,
    createdAt: message.createdAt,
    imageUrls: message.imageUrls,
    mediaKeys,
    sourceRecordId,
    text: message.text,
  });

  if (!decision.shouldCreate) {
    return [];
  }

  return [
    {
      extraction_payload: {
        source: TELEGRAM_CHANNEL_SCAN_SOURCE,
        source_type: "telegram",
        event_date_filter: decision.eventDateFilter,
        needs_ocr: decision.media.length > 0,
        telegram: {
          channel: subscription.channelUsername,
          message_created_at: message.createdAt,
          message_id: String(message.messageId),
          raw_html_length: message.rawHtml.length,
          subscription_id: subscription.id,
        },
      },
      media_keys: mediaKeys,
      review_reason: decision.reviewReason,
      source_name: channelTitle || `@${subscription.channelUsername}`,
      source_record_id: sourceRecordId,
      source_type: "telegram",
      source_url: message.sourceUrl,
      status: decision.status,
      text_snapshot: message.text,
      updated_at: new Date().toISOString(),
    },
  ];
}

export function dedupeTelegramCandidateRows(rows: TelegramCandidateInsertRow[]) {
  return Array.from(
    new Map(rows.map((row) => [row.source_record_id, row])).values(),
  );
}
