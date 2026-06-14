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
  type TelegramBroadcastTarget,
  type TelegramEventBroadcastRow,
} from "./event-broadcast-types";
import { getTelegramBroadcastPayloadHash } from "./event-broadcast-payload";

const PENDING_BROADCAST_STALE_MS = 15 * 60 * 1000;

export async function getPendingTelegramBroadcastTargets(
  options: TelegramBroadcastBatchOptions = {},
) {
  return (await getPendingTelegramBroadcastTargetBatch(options)).targets;
}

export async function getPendingTelegramBroadcastTargetBatch(
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
    return {
      hasOccurrences: false,
      targetDate,
      targets: [],
    };
  }

  const { data: eventRows, error: eventError } = await supabase
    .from("public_event_cards")
    .select("*")
    .in("id", eventIds);

  if (eventError) {
    throw new Error(eventError.message);
  }

  const rowsByEventId = new Map(
    ((eventRows ?? []) as SupabaseEventCardRow[]).map((row) => [row.id, row]),
  );

  const targetCandidates = eventIds
    .map((eventId) => rowsByEventId.get(eventId))
    .filter((row): row is SupabaseEventCardRow => Boolean(row))
    .map((row) => ({
      event: getEventForOccurrenceDate(mapEventCardRow(row), targetDate),
      occurrenceDate: targetDate,
    }));
  const { data: broadcastRows, error: broadcastError } = await supabase
    .from("telegram_event_broadcasts")
    .select(
      [
        "id",
        "event_id",
        "occurrence_date",
        "channel_id",
        "status",
        "telegram_message_id",
        "telegram_method",
        "payload_hash",
        "error_message",
        "attempt_count",
        "locked_at",
        "sent_at",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("channel_id", channelId)
    .eq("occurrence_date", targetDate)
    .in("event_id", eventIds);

  if (broadcastError) {
    throw new Error(broadcastError.message);
  }

  const broadcastRowsByEventId = new Map(
    ((broadcastRows ?? []) as unknown as TelegramEventBroadcastRow[]).map(
      (row) => [row.event_id, row],
    ),
  );
  const targets = targetCandidates
    .filter((target) =>
      shouldBroadcastTarget(target, broadcastRowsByEventId.get(target.event.id)),
    )
    .slice(0, limit);

  return {
    hasOccurrences: true,
    targetDate,
    targets,
  };
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

function shouldBroadcastTarget(
  target: TelegramBroadcastTarget,
  broadcastRow: TelegramEventBroadcastRow | undefined,
) {
  if (!broadcastRow) {
    return true;
  }

  if (broadcastRow.status === "failed") {
    return true;
  }

  if (broadcastRow.payload_hash !== getTelegramBroadcastPayloadHash(target)) {
    return true;
  }

  return broadcastRow.status === "pending" && isPendingBroadcastStale(
    broadcastRow,
  );
}

function isPendingBroadcastStale(row: TelegramEventBroadcastRow) {
  const timestamp =
    row.locked_at ?? row.updated_at ?? row.created_at ?? new Date().toISOString();
  return Date.now() - new Date(timestamp).getTime() > PENDING_BROADCAST_STALE_MS;
}
