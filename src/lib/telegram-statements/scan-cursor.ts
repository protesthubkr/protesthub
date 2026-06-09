import type { TelegramChannelMessage } from "@/lib/telegram/channel-page";
import { getBootstrapHours } from "./run-config";
import type {
  TelegramStatementFeedSubscription,
  TelegramStatementScanState,
} from "./types";

export type TelegramStatementCursorMessage = Pick<
  TelegramChannelMessage,
  "createdAt" | "messageId"
>;

export function shouldCollectMessage(
  message: TelegramChannelMessage,
  baselineMessageId: number | null | undefined,
  cutoff: string,
) {
  if (baselineMessageId !== null && baselineMessageId !== undefined) {
    return message.messageId > baselineMessageId;
  }

  return Boolean(message.createdAt && message.createdAt >= cutoff);
}

export function shouldStopScanningPage(
  messages: TelegramChannelMessage[],
  baselineMessageId: number | null | undefined,
  cutoff: string,
) {
  const oldestMessage = getOldestMessage(messages);

  if (!oldestMessage) {
    return true;
  }

  if (
    baselineMessageId !== null &&
    baselineMessageId !== undefined &&
    oldestMessage.messageId <= baselineMessageId
  ) {
    return true;
  }

  if (oldestMessage.createdAt && oldestMessage.createdAt < cutoff) {
    return true;
  }

  return false;
}

export function shouldStopBackfillPage(
  messages: TelegramChannelMessage[],
  cutoffIso: string,
) {
  const oldestMessage = getOldestMessage(messages);

  if (!oldestMessage) {
    return true;
  }

  if (oldestMessage.createdAt && oldestMessage.createdAt < cutoffIso) {
    return true;
  }

  return false;
}

export function getBootstrapCutoff(
  state: TelegramStatementScanState | null,
  subscription: TelegramStatementFeedSubscription,
) {
  if (state?.lastScannedMessageId || subscription.lastCheckedMessageId) {
    return "1970-01-01T00:00:00.000Z";
  }

  const hours = getBootstrapHours();
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function getNewestMessage(messages: TelegramChannelMessage[]) {
  return messages.reduce<TelegramStatementCursorMessage | null>(
    (newest, message) => pickNewerMessage(newest, message),
    null,
  );
}

export function getOldestMessage(messages: TelegramChannelMessage[]) {
  return messages.reduce<TelegramStatementCursorMessage | null>(
    (oldest, message) => {
      if (!oldest || message.messageId < oldest.messageId) {
        return {
          createdAt: message.createdAt,
          messageId: message.messageId,
        };
      }

      return oldest;
    },
    null,
  );
}

export function pickNewerMessage(
  current: TelegramStatementCursorMessage | null,
  next: TelegramStatementCursorMessage | null,
) {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return next.messageId > current.messageId
    ? {
        createdAt: next.createdAt,
        messageId: next.messageId,
      }
    : current;
}
