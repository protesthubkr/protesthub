import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePastEventNotice } from "@/lib/event-date-filter";
import {
  getCandidateReasons,
  shouldCreateCandidate,
  shouldReviewCandidate,
} from "@/lib/x-ingest/normalize";
import type { XMedia, XPost } from "@/lib/x-ingest/types";
import type { TelegramChannelMessage } from "./channel-page";
import {
  TELEGRAM_CHANNEL_SCAN_SOURCE,
  type TelegramChannelCandidateInsertResult,
  type TelegramChannelSubscription,
} from "./channel-subscription-types";

type TelegramCandidateEvaluation = {
  eventDateFilter: ReturnType<typeof analyzePastEventNotice>;
  media: XMedia[];
  reviewReason: string[];
  shouldCreate: boolean;
  status: "needs_review" | "ignored";
};

export async function upsertTelegramChannelCandidates({
  channelTitle,
  messages,
  subscription,
  supabase,
}: {
  channelTitle: string;
  messages: TelegramChannelMessage[];
  subscription: TelegramChannelSubscription;
  supabase: SupabaseClient;
}): Promise<TelegramChannelCandidateInsertResult> {
  if (messages.length === 0) {
    return createEmptyTelegramCandidateInsertResult();
  }

  await upsertTelegramChannelMedia({
    channelTitle,
    messages,
    subscription,
    supabase,
  });

  const rows = messages.flatMap((message) =>
    createTelegramCandidateRows({
      channelTitle,
      message,
      subscription,
    }),
  );

  if (rows.length === 0) {
    return createEmptyTelegramCandidateInsertResult();
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .upsert(rows, {
      ignoreDuplicates: true,
      onConflict: "source_type,source_record_id",
    })
    .select("source_record_id");

  if (error) {
    throw new Error(error.message);
  }

  const insertedSourceRecordIds = new Set(
    ((data as { source_record_id?: string }[] | null) ?? [])
      .map((row) => row.source_record_id)
      .filter((value): value is string => Boolean(value)),
  );
  const insertedRows =
    insertedSourceRecordIds.size > 0
      ? rows.filter((row) => insertedSourceRecordIds.has(row.source_record_id))
      : [];

  return {
    candidatesCreated: insertedRows.length,
    ignoredCreated: insertedRows.filter((row) => row.status === "ignored").length,
    needsReviewCreated: insertedRows.filter(
      (row) => row.status === "needs_review",
    ).length,
  };
}

async function upsertTelegramChannelMedia({
  channelTitle,
  messages,
  subscription,
  supabase,
}: {
  channelTitle: string;
  messages: TelegramChannelMessage[];
  subscription: TelegramChannelSubscription;
  supabase: SupabaseClient;
}) {
  const mediaRows = messages.flatMap((message) =>
    message.imageUrls.map((imageUrl, index) => ({
      alt_text: `${channelTitle} ${message.messageId}`,
      media_key: createTelegramMediaKey(
        subscription.channelUsername,
        message.messageId,
        index,
      ),
      media_type: "photo",
      preview_image_url: imageUrl,
      raw_payload: {
        message_id: message.messageId,
        source_url: message.sourceUrl,
      },
      source_type: "telegram",
      url: imageUrl,
      last_seen_at: new Date().toISOString(),
    })),
  );

  if (mediaRows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("source_media")
    .upsert(mediaRows, { onConflict: "media_key" });

  if (error) {
    throw new Error(error.message);
  }
}

function createTelegramCandidateRows({
  channelTitle,
  message,
  subscription,
}: {
  channelTitle: string;
  message: TelegramChannelMessage;
  subscription: TelegramChannelSubscription;
}) {
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

function createEmptyTelegramCandidateInsertResult(): TelegramChannelCandidateInsertResult {
  return {
    candidatesCreated: 0,
    ignoredCreated: 0,
    needsReviewCreated: 0,
  };
}

function createTelegramSourceRecordId(channelUsername: string, messageId: number) {
  return `telegram:${channelUsername}:${messageId}`;
}

function createTelegramMediaKey(
  channelUsername: string,
  messageId: number,
  index: number,
) {
  return `telegram:${channelUsername}:${messageId}:image:${index}`;
}

function evaluateTelegramCandidate({
  channelTitle,
  createdAt,
  imageUrls = [],
  mediaKeys,
  sourceRecordId,
  text,
}: {
  channelTitle: string;
  createdAt: string | null;
  imageUrls?: string[];
  mediaKeys: string[];
  sourceRecordId: string;
  text: string;
}): TelegramCandidateEvaluation {
  const media = mediaKeys.map((mediaKey, index) => ({
    alt_text: `${channelTitle} ${sourceRecordId}`.trim(),
    media_key: mediaKey,
    preview_image_url: imageUrls[index],
    type: "photo",
    url: imageUrls[index],
  })) satisfies XMedia[];
  const post = {
    attachments: mediaKeys.length > 0 ? { media_keys: mediaKeys } : undefined,
    created_at: createdAt ?? undefined,
    id: sourceRecordId,
    text,
  } satisfies XPost;
  const eventDateFilter = analyzePastEventNotice(text);
  const shouldReview =
    shouldReviewCandidate(post, media) && !eventDateFilter.ignoredAsPast;
  const status: "needs_review" | "ignored" = shouldReview
    ? "needs_review"
    : "ignored";
  const reviewReason = mergeReasons(
    [
      "telegram_channel_subscription",
      "telegram_auto_scan",
      ...(eventDateFilter.ignoredAsPast ? ["past_event_date"] : []),
    ],
    getCandidateReasons(post, media),
  );

  return {
    eventDateFilter,
    media,
    reviewReason,
    shouldCreate: shouldCreateCandidate(post, media),
    status,
  };
}

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
