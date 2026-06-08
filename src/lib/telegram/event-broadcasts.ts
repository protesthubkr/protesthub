import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapEventCardRow,
  type SupabaseEventCardRow,
} from "@/lib/event-query-model";
import { addDays, getKoreanTodayDate } from "@/lib/format";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { PublicEvent } from "@/lib/types";
import {
  broadcastEventToTelegram,
  formatTelegramEventMessage,
  type TelegramBroadcastResult,
} from "./broadcast";

const DEFAULT_BROADCAST_LIMIT = 50;

export type TelegramBroadcastBatchOptions = {
  dryRun?: boolean;
  limit?: number;
  targetDate?: string;
};

type TelegramBroadcastStatus = "pending" | "sent" | "failed";

type TelegramEventBroadcastRow = {
  id: string;
  event_id: string;
  occurrence_date: string | null;
  channel_id: string;
  status: TelegramBroadcastStatus;
  telegram_message_id: number | null;
  telegram_method: TelegramBroadcastResult["method"] | null;
  payload_hash: string;
  error_message: string | null;
  attempt_count: number;
  locked_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type TelegramBroadcastTarget = {
  event: PublicEvent;
  occurrenceDate: string;
};

export type TelegramBroadcastOutcome =
  | {
      eventId: string;
      messageId: number;
      method: TelegramBroadcastResult["method"];
      occurrenceDate: string;
      status: "sent";
    }
  | {
      eventId: string;
      occurrenceDate: string;
      reason: "already_claimed_or_sent";
      status: "skipped";
    }
  | {
      errorMessage: string;
      eventId: string;
      occurrenceDate: string;
      status: "failed";
    };

export type TelegramBroadcastDryRunOutcome = {
  eventId: string;
  hasPosterImage: boolean;
  message: string;
  method: TelegramBroadcastResult["method"];
  occurrenceDate: string;
  status: "dry_run";
  title: string;
};

export async function getPendingTelegramBroadcastTargets(
  options: TelegramBroadcastBatchOptions = {},
) {
  const supabase = getRequiredSupabaseAdminClient();
  const channelId = getTelegramChannelId();
  const limit = options.limit ?? DEFAULT_BROADCAST_LIMIT;
  const targetDate =
    options.targetDate ?? getDefaultTelegramBroadcastTargetDate();
  const candidateLimit = Math.max(limit * 3, limit);

  const { data: occurrenceRows, error: occurrenceError } = await supabase
    .from("public_event_occurrences")
    .select("id,occurrence_date,occurrence_start_time")
    .eq("occurrence_date", targetDate)
    .order("occurrence_date", { ascending: true })
    .order("occurrence_start_time", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(candidateLimit);

  if (occurrenceError) {
    throw new Error(occurrenceError.message);
  }

  const eventIds = getUniqueEventIds(
    ((occurrenceRows ?? []) as { id: string }[]).map((row) => row.id),
  );

  if (eventIds.length === 0) {
    return [];
  }

  const { data: eventRows, error: eventError } = await supabase
    .from("public_event_cards")
    .select("*")
    .in("id", eventIds);

  if (eventError) {
    throw new Error(eventError.message);
  }

  const { data: broadcastRows, error: broadcastError } = await supabase
    .from("telegram_event_broadcasts")
    .select("event_id,status,occurrence_date")
    .eq("channel_id", channelId)
    .eq("occurrence_date", targetDate)
    .in("event_id", eventIds)
    .in("status", ["pending", "sent"]);

  if (broadcastError) {
    throw new Error(broadcastError.message);
  }

  const blockedEventIds = new Set(
    (
      (broadcastRows ?? []) as Pick<TelegramEventBroadcastRow, "event_id">[]
    ).map((row) => row.event_id),
  );
  const rowsByEventId = new Map(
    ((eventRows ?? []) as SupabaseEventCardRow[]).map((row) => [row.id, row]),
  );

  return eventIds
    .map((eventId) => rowsByEventId.get(eventId))
    .filter((row): row is SupabaseEventCardRow => Boolean(row))
    .filter((row) => !blockedEventIds.has(row.id))
    .slice(0, limit)
    .map((row) => ({
      event: getEventForOccurrenceDate(mapEventCardRow(row), targetDate),
      occurrenceDate: targetDate,
    }));
}

export async function getPendingTelegramBroadcastEvents(
  options: TelegramBroadcastBatchOptions = {},
) {
  return (await getPendingTelegramBroadcastTargets(options)).map(
    (target) => target.event,
  );
}

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
  const channelId = getTelegramChannelId();
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

async function getPublishedEventById(eventId: string) {
  const supabase = getRequiredSupabaseAdminClient();
  const { data, error } = await supabase
    .from("public_event_cards")
    .select("*")
    .eq("id", eventId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapEventCardRow(data as SupabaseEventCardRow) : null;
}

async function claimTelegramEventBroadcast(
  supabase: SupabaseClient,
  {
    channelId,
    eventId,
    occurrenceDate,
    payloadHash,
  }: {
    channelId: string;
    eventId: string;
    occurrenceDate: string;
    payloadHash: string;
  },
) {
  const { data, error } = await supabase.rpc(
    "claim_telegram_event_broadcast",
    {
      p_channel_id: channelId,
      p_event_id: eventId,
      p_occurrence_date: occurrenceDate,
      p_payload_hash: payloadHash,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data as TelegramEventBroadcastRow | null;
}

async function markTelegramEventBroadcastSent(
  supabase: SupabaseClient,
  {
    broadcastId,
    result,
  }: {
    broadcastId: string;
    result: TelegramBroadcastResult;
  },
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("telegram_event_broadcasts")
    .update({
      error_message: null,
      locked_at: null,
      sent_at: now,
      status: "sent",
      telegram_message_id: result.messageId,
      telegram_method: result.method,
      updated_at: now,
    })
    .eq("id", broadcastId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markTelegramEventBroadcastFailed(
  supabase: SupabaseClient,
  {
    broadcastId,
    errorMessage,
  }: {
    broadcastId: string;
    errorMessage: string;
  },
) {
  const { error } = await supabase
    .from("telegram_event_broadcasts")
    .update({
      error_message: errorMessage,
      locked_at: null,
      status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", broadcastId);

  if (error) {
    throw new Error(error.message);
  }
}

function getTelegramBroadcastPayloadHash(target: TelegramBroadcastTarget) {
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

function getTelegramBroadcastDryRunOutcome(
  target: TelegramBroadcastTarget,
): TelegramBroadcastDryRunOutcome {
  return {
    eventId: target.event.id,
    hasPosterImage: Boolean(target.event.posterImageUrl),
    message: formatTelegramEventMessage(target.event),
    method: target.event.posterImageUrl ? "sendPhoto" : "sendMessage",
    occurrenceDate: target.occurrenceDate,
    status: "dry_run",
    title: target.event.title,
  };
}

function getEventForOccurrenceDate(event: PublicEvent, occurrenceDate: string) {
  const dates = event.dates.filter((date) => date.date === occurrenceDate);

  if (dates.length === 0) {
    throw new Error(
      `Event ${event.id} does not have occurrence date ${occurrenceDate}.`,
    );
  }

  return {
    ...event,
    dates,
  };
}

function getNextBroadcastOccurrenceDate(event: PublicEvent) {
  const today = getKoreanTodayDate();
  const sortedDates = [...event.dates].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }

    if (a.startTime === null && b.startTime === null) {
      return 0;
    }

    if (a.startTime === null) {
      return 1;
    }

    if (b.startTime === null) {
      return -1;
    }

    return a.startTime.localeCompare(b.startTime);
  });
  const nextDate = sortedDates.find((date) => date.date >= today);

  if (nextDate) {
    return nextDate.date;
  }

  if (sortedDates[0]) {
    return sortedDates[0].date;
  }

  throw new Error(`Event ${event.id} does not have dates.`);
}

function getRequiredSupabaseAdminClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

function getTelegramChannelId() {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!channelId) {
    throw new Error("TELEGRAM_CHANNEL_ID is not configured.");
  }

  return channelId;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getUniqueEventIds(eventIds: string[]) {
  return Array.from(new Set(eventIds));
}

function getDefaultTelegramBroadcastTargetDate() {
  return addDays(getKoreanTodayDate(), 1);
}
