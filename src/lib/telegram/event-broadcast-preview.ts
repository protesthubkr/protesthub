import "server-only";

import { addDays } from "@/lib/format";
import {
  mapEventCardRow,
  type SupabaseEventCardRow,
} from "@/lib/event-query-model";
import {
  getDefaultTelegramBroadcastTargetDate,
  getEventForOccurrenceDate,
} from "./event-broadcast-dates";
import {
  getTelegramBroadcastDryRunOutcome,
  getTelegramBroadcastPayloadHash,
  getTelegramNoEventsBroadcastDryRunOutcome,
  getTelegramNoEventsBroadcastPayloadHash,
} from "./event-broadcast-payload";
import {
  getRequiredSupabaseAdminClient,
  getTelegramBroadcastChannelId,
} from "./event-broadcast-repository";
import {
  DEFAULT_BROADCAST_LIMIT,
  type TelegramBroadcastPreview,
  type TelegramBroadcastPreviewItem,
  type TelegramBroadcastPreviewState,
  type TelegramBroadcastTarget,
  type TelegramDailyBroadcastRow,
  type TelegramEventBroadcastRow,
} from "./event-broadcast-types";

type OccurrenceRow = {
  id: string;
  occurrence_date: string;
  occurrence_start_time: string | null;
};

const BROADCAST_PREVIEW_LOOKAHEAD_DAYS = 31;

export async function getNextTelegramBroadcastPreview(): Promise<TelegramBroadcastPreview> {
  const targetDate = getDefaultTelegramBroadcastTargetDate();

  try {
    return await getNextActionableTelegramBroadcastPreview(targetDate);
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : String(error),
      generatedAt: new Date().toISOString(),
      hasOccurrences: false,
      items: [],
      targetDate,
    };
  }
}

export const getTomorrowTelegramBroadcastPreview =
  getNextTelegramBroadcastPreview;

async function getNextActionableTelegramBroadcastPreview(startDate: string) {
  let currentDate = startDate;

  for (let index = 0; index < BROADCAST_PREVIEW_LOOKAHEAD_DAYS; index += 1) {
    const preview = await getTelegramBroadcastPreview(currentDate);

    if (!isCompletedPreview(preview)) {
      return preview;
    }

    currentDate = addDays(currentDate, 1);
  }

  return getTelegramBroadcastPreview(currentDate);
}

async function getTelegramBroadcastPreview(
  targetDate: string,
): Promise<TelegramBroadcastPreview> {
  const supabase = getRequiredSupabaseAdminClient();
  const channelId = getTelegramBroadcastChannelId();
  const { data: occurrenceRows, error: occurrenceError } = await supabase
    .from("public_event_occurrences")
    .select("id,occurrence_date,occurrence_start_time")
    .eq("occurrence_date", targetDate)
    .order("occurrence_date", { ascending: true })
    .order("occurrence_start_time", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(DEFAULT_BROADCAST_LIMIT);

  if (occurrenceError) {
    throw new Error(occurrenceError.message);
  }

  const eventIds = getUniqueEventIds(
    ((occurrenceRows ?? []) as OccurrenceRow[]).map((row) => row.id),
  );

  if (eventIds.length === 0) {
    return getNoEventsPreview({ channelId, targetDate });
  }

  const [{ data: eventRows, error: eventError }, { data: broadcastRows, error }] =
    await Promise.all([
      supabase.from("public_event_cards").select("*").in("id", eventIds),
      supabase
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
        .in("event_id", eventIds),
    ]);

  if (eventError) {
    throw new Error(eventError.message);
  }

  if (error) {
    throw new Error(error.message);
  }

  const eventRowsById = new Map(
    ((eventRows ?? []) as SupabaseEventCardRow[]).map((row) => [row.id, row]),
  );
  const broadcastRowsByEventId = new Map(
    ((broadcastRows ?? []) as unknown as TelegramEventBroadcastRow[]).map(
      (row) => [row.event_id, row],
    ),
  );
  const items = eventIds
    .map((eventId) => eventRowsById.get(eventId))
    .filter((row): row is SupabaseEventCardRow => Boolean(row))
    .map((row) => {
      const target = {
        event: getEventForOccurrenceDate(mapEventCardRow(row), targetDate),
        occurrenceDate: targetDate,
      };
      return getEventPreviewItem(
        target,
        broadcastRowsByEventId.get(target.event.id),
      );
    });

  return {
    generatedAt: new Date().toISOString(),
    hasOccurrences: true,
    items,
    targetDate,
  };
}

async function getNoEventsPreview({
  channelId,
  targetDate,
}: {
  channelId: string;
  targetDate: string;
}): Promise<TelegramBroadcastPreview> {
  const supabase = getRequiredSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telegram_daily_broadcasts")
    .select(
      [
        "id",
        "broadcast_type",
        "target_date",
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
    .eq("broadcast_type", "no_events")
    .eq("channel_id", channelId)
    .eq("target_date", targetDate)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const payloadHash = getTelegramNoEventsBroadcastPayloadHash(targetDate);
  const dryRun = getTelegramNoEventsBroadcastDryRunOutcome(targetDate);

  return {
    generatedAt: new Date().toISOString(),
    hasOccurrences: false,
    items: [
      {
        ...dryRun,
        payloadHash,
        previewState: getPreviewState(
          data as TelegramDailyBroadcastRow | null,
          payloadHash,
        ),
      },
    ],
    targetDate,
  };
}

function getEventPreviewItem(
  target: TelegramBroadcastTarget,
  broadcastRow: TelegramEventBroadcastRow | undefined,
): TelegramBroadcastPreviewItem {
  const payloadHash = getTelegramBroadcastPayloadHash(target);

  return {
    ...getTelegramBroadcastDryRunOutcome(target),
    payloadHash,
    previewState: getPreviewState(broadcastRow ?? null, payloadHash),
  };
}

function getPreviewState(
  row: TelegramDailyBroadcastRow | TelegramEventBroadcastRow | null,
  payloadHash: string,
): TelegramBroadcastPreviewState {
  if (!row) {
    return "ready";
  }

  if (row.payload_hash !== payloadHash) {
    return "changed";
  }

  return row.status;
}

function getUniqueEventIds(eventIds: string[]) {
  return Array.from(new Set(eventIds));
}

function isCompletedPreview(preview: TelegramBroadcastPreview) {
  return (
    !preview.errorMessage &&
    preview.items.length > 0 &&
    preview.items.every((item) => item.previewState === "sent")
  );
}
