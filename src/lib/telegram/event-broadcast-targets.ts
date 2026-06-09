import "server-only";

import {
  mapEventCardRow,
  type SupabaseEventCardRow,
} from "@/lib/event-query-model";
import {
  getDefaultTelegramBroadcastTargetDate,
  getEventForOccurrenceDate,
} from "./event-broadcast-dates";
import {
  getRequiredSupabaseAdminClient,
  getTelegramBroadcastChannelId,
} from "./event-broadcast-repository";
import {
  DEFAULT_BROADCAST_LIMIT,
  type TelegramBroadcastBatchOptions,
  type TelegramEventBroadcastRow,
} from "./event-broadcast-types";

export async function getPendingTelegramBroadcastTargets(
  options: TelegramBroadcastBatchOptions = {},
) {
  const supabase = getRequiredSupabaseAdminClient();
  const channelId = getTelegramBroadcastChannelId();
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

export async function getPublishedEventById(eventId: string) {
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

function getUniqueEventIds(eventIds: string[]) {
  return Array.from(new Set(eventIds));
}
