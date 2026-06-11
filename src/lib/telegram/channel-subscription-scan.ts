import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  fetchTelegramChannelPage,
  type TelegramChannelMessage,
  type TelegramChannelPage,
} from "./channel-page";
import { upsertTelegramChannelCandidates } from "./channel-candidate-ingest";
import {
  getScannableTelegramChannelSubscriptions,
  markTelegramSubscriptionScanFailed,
  markTelegramSubscriptionScanStarted,
  markTelegramSubscriptionScanSucceeded,
} from "./channel-subscription-repository";
import {
  NEW_CHANNEL_LOOKBACK_DAYS,
  type TelegramChannelCursorMessage,
  type TelegramChannelScanResult,
  type TelegramChannelSubscription,
} from "./channel-subscription-types";

export async function scanTelegramChannelSubscriptions({
  subscriptionId,
}: {
  subscriptionId?: string;
} = {}): Promise<TelegramChannelScanResult> {
  const supabase = getRequiredSupabaseAdminClient();
  const subscriptions = await getScannableTelegramChannelSubscriptions(
    supabase,
    subscriptionId,
  );
  const result: TelegramChannelScanResult = {
    candidatesCreated: 0,
    candidatesPromoted: 0,
    candidatesRefreshed: 0,
    channelsScanned: 0,
    ignoredCreated: 0,
    messagesSeen: 0,
    needsReviewCreated: 0,
  };

  for (const subscription of subscriptions) {
    result.channelsScanned += 1;
    const channelStartedAt = new Date().toISOString();

    await markTelegramSubscriptionScanStarted(
      supabase,
      subscription.id,
      channelStartedAt,
    );

    try {
      const scan = await scanSingleTelegramChannelSubscription(
        supabase,
        subscription,
      );
      result.candidatesCreated += scan.candidatesCreated;
      result.candidatesPromoted += scan.candidatesPromoted;
      result.candidatesRefreshed += scan.candidatesRefreshed;
      result.ignoredCreated += scan.ignoredCreated;
      result.messagesSeen += scan.messagesSeen;
      result.needsReviewCreated += scan.needsReviewCreated;
    } catch (error) {
      await markTelegramSubscriptionScanFailed(supabase, subscription.id, error);
      throw error;
    }
  }

  return result;
}

async function scanSingleTelegramChannelSubscription(
  supabase: SupabaseClient,
  subscription: TelegramChannelSubscription,
) {
  const scanStartedAt = new Date().toISOString();
  const cutoff = getSubscriptionCutoff(subscription, scanStartedAt);
  const maxPages = getMaxPagesPerChannel();
  let beforeMessageId: number | null = null;
  let candidatesCreated = 0;
  let candidatesPromoted = 0;
  let candidatesRefreshed = 0;
  let ignoredCreated = 0;
  let messagesSeen = 0;
  let needsReviewCreated = 0;
  let newestMessage = getCursorMessage(subscription);
  let latestChannelTitle = subscription.channelTitle;

  for (
    let pageIndex = 0;
    maxPages === null || pageIndex < maxPages;
    pageIndex += 1
  ) {
    const page = await fetchTelegramChannelPage(
      subscription.channelUsername,
      beforeMessageId,
    );

    if (page.channelTitle) {
      latestChannelTitle = page.channelTitle;
    }

    if (page.messages.length === 0) {
      break;
    }

    const eligibleMessages = page.messages.filter((message) =>
      shouldCollectMessage(message, subscription, cutoff),
    );
    messagesSeen += eligibleMessages.length;

    const upsertResult = await upsertTelegramChannelCandidates({
      channelTitle: latestChannelTitle,
      messages: eligibleMessages,
      subscription,
      supabase,
    });
    candidatesCreated += upsertResult.candidatesCreated;
    candidatesPromoted += upsertResult.candidatesPromoted;
    candidatesRefreshed += upsertResult.candidatesRefreshed;
    ignoredCreated += upsertResult.ignoredCreated;
    needsReviewCreated += upsertResult.needsReviewCreated;
    newestMessage = pickNewerMessage(newestMessage, getNewestMessage(page.messages));

    if (shouldStopScanningPage(page, subscription, cutoff)) {
      break;
    }

    beforeMessageId = page.beforeMessageId;

    if (!beforeMessageId) {
      break;
    }
  }

  await markTelegramSubscriptionScanSucceeded({
    channelTitle: latestChannelTitle,
    newestMessage,
    scanStartedAt,
    subscription,
    supabase,
  });

  return {
    candidatesCreated,
    candidatesPromoted,
    candidatesRefreshed,
    ignoredCreated,
    messagesSeen,
    needsReviewCreated,
  };
}

function shouldCollectMessage(
  message: TelegramChannelMessage,
  subscription: TelegramChannelSubscription,
  cutoff: string,
) {
  if (!message.text.trim() && message.imageUrls.length === 0) {
    return false;
  }

  if (subscription.lastCheckedMessageId !== null) {
    return message.messageId > subscription.lastCheckedMessageId;
  }

  if (message.createdAt && message.createdAt < cutoff) {
    return false;
  }

  if (subscription.lastCheckedAt && message.createdAt) {
    return message.createdAt > subscription.lastCheckedAt;
  }

  return true;
}

function shouldStopScanningPage(
  page: TelegramChannelPage,
  subscription: TelegramChannelSubscription,
  cutoff: string,
) {
  const oldestMessage = getOldestMessage(page.messages);

  if (!oldestMessage) {
    return true;
  }

  if (
    subscription.lastCheckedMessageId !== null &&
    oldestMessage.messageId <= subscription.lastCheckedMessageId
  ) {
    return true;
  }

  if (oldestMessage.createdAt && oldestMessage.createdAt < cutoff) {
    return true;
  }

  return false;
}

function getSubscriptionCutoff(
  subscription: TelegramChannelSubscription,
  now: string,
) {
  if (subscription.lastCheckedMessageId !== null) {
    return "1970-01-01T00:00:00.000Z";
  }

  return (
    subscription.lastCheckedMessageAt ??
    subscription.lastCheckedAt ??
    subtractDaysIso(now, NEW_CHANNEL_LOOKBACK_DAYS)
  );
}

function getCursorMessage(subscription: TelegramChannelSubscription) {
  if (subscription.lastCheckedMessageId === null) {
    return null;
  }

  return {
    createdAt: subscription.lastCheckedMessageAt,
    messageId: subscription.lastCheckedMessageId,
  };
}

function getNewestMessage(messages: TelegramChannelMessage[]) {
  return messages.reduce<TelegramChannelCursorMessage | null>(
    (newest, message) => pickNewerMessage(newest, toCursorMessage(message)),
    null,
  );
}

function getOldestMessage(messages: TelegramChannelMessage[]) {
  return messages.reduce<TelegramChannelCursorMessage | null>(
    (oldest, message) => {
      if (!oldest) {
        return toCursorMessage(message);
      }

      return message.messageId < oldest.messageId
        ? toCursorMessage(message)
        : oldest;
    },
    null,
  );
}

function pickNewerMessage(
  current: TelegramChannelCursorMessage | null,
  next: TelegramChannelCursorMessage | null,
) {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return next.messageId > current.messageId ? next : current;
}

function toCursorMessage(
  message: Pick<TelegramChannelMessage, "createdAt" | "messageId">,
): TelegramChannelCursorMessage {
  return {
    createdAt: message.createdAt,
    messageId: message.messageId,
  };
}

function getMaxPagesPerChannel() {
  const parsed = Number.parseInt(
    process.env.TELEGRAM_CHANNEL_SCAN_MAX_PAGES ?? "",
    10,
  );

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getRequiredSupabaseAdminClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

function subtractDaysIso(value: string, days: number) {
  return new Date(Date.parse(value) - days * 24 * 60 * 60 * 1000).toISOString();
}
