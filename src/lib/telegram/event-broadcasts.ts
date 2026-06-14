import "server-only";

import {
  broadcastEventToTelegram,
  broadcastNoEventsToTelegram,
  editEventTelegramBroadcast,
  editNoEventsTelegramBroadcast,
} from "./broadcast";
import {
  getDefaultTelegramBroadcastTargetDate,
  getEventForOccurrenceDate,
  getNextBroadcastOccurrenceDate,
} from "./event-broadcast-dates";
import {
  getTelegramBroadcastDryRunOutcome,
  getTelegramBroadcastPayloadHash,
  getTelegramNoEventsBroadcastDryRunOutcome,
  getTelegramNoEventsBroadcastPayloadHash,
} from "./event-broadcast-payload";
import {
  claimTelegramDailyBroadcast,
  claimTelegramEventBroadcast,
  getRequiredSupabaseAdminClient,
  getTelegramBroadcastChannelId,
  markTelegramDailyBroadcastFailed,
  markTelegramDailyBroadcastSent,
  markTelegramEventBroadcastFailed,
  markTelegramEventBroadcastSent,
} from "./event-broadcast-repository";
export {
  getPendingTelegramBroadcastEvents,
  getPendingTelegramBroadcastTargets,
} from "./event-broadcast-targets";
import {
  getPendingTelegramBroadcastTargetBatch,
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
  const batch = await getPendingTelegramBroadcastTargetBatch({
    ...options,
    targetDate,
  });
  const { targets } = batch;

  if (options.dryRun) {
    return {
      dryRun: true,
      outcomes: batch.hasOccurrences
        ? targets.map(getTelegramBroadcastDryRunOutcome)
        : [getTelegramNoEventsBroadcastDryRunOutcome(targetDate)],
      targetDate,
    };
  }

  const outcomes: TelegramBroadcastOutcome[] = [];

  if (batch.hasOccurrences) {
    for (const target of targets) {
      outcomes.push(await broadcastClaimedTargetToTelegram(target));
    }
  } else {
    outcomes.push(await broadcastClaimedNoEventsToTelegram(targetDate));
  }

  return {
    dryRun: false,
    outcomes,
    targetDate,
  };
}

async function broadcastClaimedNoEventsToTelegram(
  targetDate: string,
): Promise<TelegramBroadcastOutcome> {
  const supabase = getRequiredSupabaseAdminClient();
  const channelId = getTelegramBroadcastChannelId();
  const payloadHash = getTelegramNoEventsBroadcastPayloadHash(targetDate);
  const claim = await claimTelegramDailyBroadcast(supabase, {
    broadcastType: "no_events",
    channelId,
    payloadHash,
    targetDate,
  });

  if (!claim) {
    return {
      broadcastType: "no_events",
      occurrenceDate: targetDate,
      reason: "already_claimed_or_sent",
      status: "skipped",
    };
  }

  try {
    const result = claim.telegram_message_id
      ? await editNoEventsTelegramBroadcast(claim.telegram_message_id)
      : await broadcastNoEventsToTelegram();

    await markTelegramDailyBroadcastSent(supabase, {
      broadcastId: claim.id,
      result,
    });

    return {
      broadcastType: "no_events",
      messageId: result.messageId,
      method: result.method,
      occurrenceDate: targetDate,
      status: "sent",
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await markTelegramDailyBroadcastFailed(supabase, {
      broadcastId: claim.id,
      errorMessage,
    });

    return {
      broadcastType: "no_events",
      errorMessage,
      occurrenceDate: targetDate,
      status: "failed",
    };
  }
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
    const result =
      claim.telegram_message_id && claim.telegram_method
        ? await editEventTelegramBroadcast({
            event: target.event,
            messageId: claim.telegram_message_id,
            method: claim.telegram_method,
          })
        : await broadcastEventToTelegram(target.event);

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
