import "server-only";

import { broadcastEventToTelegram } from "./broadcast";
import {
  getDefaultTelegramBroadcastTargetDate,
  getEventForOccurrenceDate,
  getNextBroadcastOccurrenceDate,
} from "./event-broadcast-dates";
import {
  getTelegramBroadcastDryRunOutcome,
  getTelegramBroadcastPayloadHash,
} from "./event-broadcast-payload";
import {
  claimTelegramEventBroadcast,
  getRequiredSupabaseAdminClient,
  getTelegramBroadcastChannelId,
  markTelegramEventBroadcastFailed,
  markTelegramEventBroadcastSent,
} from "./event-broadcast-repository";
export {
  getPendingTelegramBroadcastEvents,
  getPendingTelegramBroadcastTargets,
} from "./event-broadcast-targets";
import {
  getPendingTelegramBroadcastTargets,
  getPublishedEventById,
} from "./event-broadcast-targets";
import type {
  TelegramBroadcastBatchOptions,
  TelegramBroadcastDryRunOutcome,
  TelegramBroadcastOutcome,
  TelegramBroadcastTarget,
} from "./event-broadcast-types";

export async function broadcastPublishedEventToTelegram(
  eventId: string,
  options: Pick<TelegramBroadcastBatchOptions, "dryRun" | "targetDate"> = {},
): Promise<TelegramBroadcastOutcome | TelegramBroadcastDryRunOutcome> {
  const event = await getPublishedEventById(eventId);

  if (!event) {
    throw new Error(`Published event not found: ${eventId}`);
  }

  const occurrenceDate =
    options.targetDate ?? getNextBroadcastOccurrenceDate(event);
  const target = {
    event: getEventForOccurrenceDate(event, occurrenceDate),
    occurrenceDate,
  };

  if (options.dryRun) {
    return getTelegramBroadcastDryRunOutcome(target);
  }

  return broadcastClaimedTargetToTelegram(target);
}

export async function broadcastPendingTelegramEvents(
  options: TelegramBroadcastBatchOptions = {},
) {
  const targetDate =
    options.targetDate ?? getDefaultTelegramBroadcastTargetDate();
  const targets = await getPendingTelegramBroadcastTargets({
    ...options,
    targetDate,
  });

  if (options.dryRun) {
    return {
      dryRun: true,
      outcomes: targets.map(getTelegramBroadcastDryRunOutcome),
      targetDate,
    };
  }

  const outcomes: TelegramBroadcastOutcome[] = [];

  for (const target of targets) {
    outcomes.push(await broadcastClaimedTargetToTelegram(target));
  }

  return {
    dryRun: false,
    outcomes,
    targetDate,
  };
}

async function broadcastClaimedTargetToTelegram(
  target: TelegramBroadcastTarget,
): Promise<TelegramBroadcastOutcome> {
  const supabase = getRequiredSupabaseAdminClient();
  const channelId = getTelegramBroadcastChannelId();
  const payloadHash = getTelegramBroadcastPayloadHash(target);
  const claim = await claimTelegramEventBroadcast(supabase, {
    channelId,
    eventId: target.event.id,
    occurrenceDate: target.occurrenceDate,
    payloadHash,
  });

  if (!claim) {
    return {
      eventId: target.event.id,
      occurrenceDate: target.occurrenceDate,
      reason: "already_claimed_or_sent",
      status: "skipped",
    };
  }

  try {
    const result = await broadcastEventToTelegram(target.event);

    await markTelegramEventBroadcastSent(supabase, {
      broadcastId: claim.id,
      result,
    });

    return {
      eventId: target.event.id,
      messageId: result.messageId,
      method: result.method,
      occurrenceDate: target.occurrenceDate,
      status: "sent",
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await markTelegramEventBroadcastFailed(supabase, {
      broadcastId: claim.id,
      errorMessage,
    });

    return {
      errorMessage,
      eventId: target.event.id,
      occurrenceDate: target.occurrenceDate,
      status: "failed",
    };
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
