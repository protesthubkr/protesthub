import { analyzePastEventNotice } from "@/lib/event-date-filter";
import {
  getCandidateReasons,
  shouldCreateCandidate,
  shouldReviewCandidate,
} from "@/lib/x-ingest/normalize-rules";
import type { XMedia, XPost } from "@/lib/x-ingest/types";
import { mergeReasons } from "./channel-candidate-review";

export type TelegramCandidateEvaluation = {
  eventDateFilter: ReturnType<typeof analyzePastEventNotice>;
  media: XMedia[];
  reviewReason: string[];
  shouldCreate: boolean;
  status: "needs_review" | "ignored";
};

export function evaluateTelegramCandidate({
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
  const status = shouldReview ? "needs_review" : "ignored";
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
