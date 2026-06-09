import {
  fetchTelegramChannelPage,
  type TelegramChannelMessage,
} from "@/lib/telegram/channel-page";
import {
  getBootstrapCutoff,
  getNewestMessage,
  pickNewerMessage,
  shouldCollectMessage,
  shouldStopBackfillPage,
  shouldStopScanningPage,
  type TelegramStatementCursorMessage,
} from "./scan-cursor";
import type {
  TelegramStatementFeedSubscription,
  TelegramStatementScanState,
} from "./types";

export type TelegramStatementMessageCollection = {
  cursorMessage: TelegramStatementCursorMessage | null;
  messages: TelegramChannelMessage[];
};

export async function collectBackfillTelegramStatementMessages({
  cutoffIso,
  maxPagesPerChannel,
  subscription,
}: {
  cutoffIso: string;
  maxPagesPerChannel: number;
  subscription: TelegramStatementFeedSubscription;
}): Promise<TelegramStatementMessageCollection> {
  const messages: TelegramChannelMessage[] = [];
  let beforeMessageId: number | null = null;
  let cursorMessage: TelegramStatementCursorMessage | null = null;

  for (let pageIndex = 0; pageIndex < maxPagesPerChannel; pageIndex += 1) {
    const page = await fetchTelegramChannelPage(
      subscription.channelUsername,
      beforeMessageId,
    );

    if (page.messages.length === 0) {
      break;
    }

    cursorMessage = pickNewerMessage(cursorMessage, getNewestMessage(page.messages));
    messages.push(
      ...page.messages.filter(
        (message) =>
          message.text.trim().length > 0 &&
          Boolean(message.createdAt && message.createdAt >= cutoffIso),
      ),
    );

    if (shouldStopBackfillPage(page.messages, cutoffIso)) {
      break;
    }

    beforeMessageId = page.beforeMessageId;

    if (!beforeMessageId) {
      break;
    }
  }

  return {
    cursorMessage,
    messages,
  };
}

export async function collectNewTelegramStatementMessages({
  maxPagesPerChannel,
  state,
  subscription,
}: {
  maxPagesPerChannel: number;
  state: TelegramStatementScanState | null;
  subscription: TelegramStatementFeedSubscription;
}): Promise<TelegramStatementMessageCollection> {
  const baselineMessageId =
    state?.lastScannedMessageId ?? subscription.lastCheckedMessageId;
  const cutoff = getBootstrapCutoff(state, subscription);
  const messages: TelegramChannelMessage[] = [];
  let beforeMessageId: number | null = null;
  let cursorMessage: TelegramStatementCursorMessage | null = baselineMessageId
    ? {
        createdAt:
          state?.lastScannedMessageAt ?? subscription.lastCheckedMessageAt,
        messageId: baselineMessageId,
      }
    : null;

  for (let pageIndex = 0; pageIndex < maxPagesPerChannel; pageIndex += 1) {
    const page = await fetchTelegramChannelPage(
      subscription.channelUsername,
      beforeMessageId,
    );

    if (page.messages.length === 0) {
      break;
    }

    cursorMessage = pickNewerMessage(cursorMessage, getNewestMessage(page.messages));

    const newMessages = page.messages.filter((message) =>
      shouldCollectMessage(message, baselineMessageId, cutoff),
    );
    messages.push(
      ...newMessages.filter((message) => message.text.trim().length > 0),
    );

    if (shouldStopScanningPage(page.messages, baselineMessageId, cutoff)) {
      break;
    }

    beforeMessageId = page.beforeMessageId;

    if (!beforeMessageId) {
      break;
    }
  }

  return {
    cursorMessage,
    messages,
  };
}
