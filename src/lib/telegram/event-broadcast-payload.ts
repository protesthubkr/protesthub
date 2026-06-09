import { createHash } from "crypto";
import {
  formatTelegramEventMessage,
  type TelegramBroadcastResult,
} from "./broadcast";
import type {
  TelegramBroadcastDryRunOutcome,
  TelegramBroadcastTarget,
} from "./event-broadcast-types";

export function getTelegramBroadcastPayloadHash(
  target: TelegramBroadcastTarget,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        message: formatTelegramEventMessage(target.event),
        occurrenceDate: target.occurrenceDate,
        posterImageUrl: target.event.posterImageUrl ?? null,
        sourcePostUrl:
          target.event.cancelSourceUrl ?? target.event.sourcePostUrl,
      }),
    )
    .digest("hex");
}

export function getTelegramBroadcastDryRunOutcome(
  target: TelegramBroadcastTarget,
): TelegramBroadcastDryRunOutcome {
  return {
    eventId: target.event.id,
    hasPosterImage: Boolean(target.event.posterImageUrl),
    message: formatTelegramEventMessage(target.event),
    method: getTelegramBroadcastMethod(target),
    occurrenceDate: target.occurrenceDate,
    status: "dry_run",
    title: target.event.title,
  };
}

function getTelegramBroadcastMethod(
  target: TelegramBroadcastTarget,
): TelegramBroadcastResult["method"] {
  return target.event.posterImageUrl ? "sendPhoto" : "sendMessage";
}
