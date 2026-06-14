import { addDays, compareOccurrences } from "./format";
import { PUBLIC_EVENT_WINDOW_DAYS } from "./public-event-date-policy";
import type {
  EventCalendarDaySummary,
  EventListOccurrence,
  EventOccurrenceWindow,
  IssueKey,
  PublicEvent,
} from "./types";

const CALENDAR_DAY_SAMPLE_LIMIT = 4;

export type SupabaseEventCardRow = {
  id: string;
  title: string;
  venue: string;
  address: string;
  region: string;
  organizer_name: string | null;
  source_account_name: string;
  source_post_url: string;
  cancel_source_url: string | null;
  issue_tags: IssueKey[];
  primary_issue: IssueKey;
  status: "published" | "canceled";
  last_checked_at: string;
  poster_image_url: string | null;
  dates: { date: string; start_time: string | null }[];
};

type SupabaseEventOccurrenceRow = {
  id: string;
  title: string;
  venue: string;
  region: string;
  organizer_name: string | null;
  source_account_name: string;
  issue_tags: IssueKey[];
  primary_issue: IssueKey;
  occurrence_date: string;
  occurrence_start_time: string | null;
};

export type SupabaseEventOccurrenceWindowRpcRow = {
  events: unknown;
  has_more_events: boolean | null;
  next_from_date: string;
  window_end_date: string;
  window_start_date: string;
};

export type SupabaseCalendarOccurrenceRow = {
  id: string;
  title: string;
  primary_issue: IssueKey;
  occurrence_date: string;
  occurrence_start_time: string | null;
};

export type OrganizerRow = {
  organizer_name: string | null;
  source_account_name: string;
};

export function mapEventCardRow(row: SupabaseEventCardRow): PublicEvent {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    address: row.address,
    region: row.region,
    organizerName: normalizeOptionalText(row.organizer_name),
    sourceAccountName: row.source_account_name,
    sourcePostUrl: row.source_post_url,
    cancelSourceUrl: row.cancel_source_url ?? undefined,
    issueTags: row.issue_tags,
    primaryIssue: row.primary_issue,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    posterImageUrl: row.poster_image_url ?? undefined,
    dates: row.dates.map((date) => ({
      date: normalizeDateValue(date.date),
      startTime: normalizeTimeValue(date.start_time),
    })),
  };
}

function mapOccurrenceRow(row: SupabaseEventOccurrenceRow): EventListOccurrence {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    region: row.region,
    organizerName: getOrganizerDisplayName(row),
    sourceAccountName: row.source_account_name,
    issueTags: row.issue_tags,
    primaryIssue: row.primary_issue,
    occurrenceDate: normalizeDateValue(row.occurrence_date),
    occurrenceStartTime: normalizeTimeValue(row.occurrence_start_time),
  };
}

export function mapOccurrenceWindowRpcRow(
  row: SupabaseEventOccurrenceWindowRpcRow | null,
  fallbackFromDate: string,
): EventOccurrenceWindow {
  if (!row) {
    return createEmptyOccurrenceWindow(fallbackFromDate);
  }

  return {
    events: parseOccurrenceRows(row.events)
      .map(mapOccurrenceRow)
      .sort(compareOccurrences),
    hasMoreEvents: Boolean(row.has_more_events),
    nextFromDate: normalizeDateValue(row.next_from_date),
    windowEndDate: normalizeDateValue(row.window_end_date),
    windowStartDate: normalizeDateValue(row.window_start_date),
  };
}

export function createEmptyOccurrenceWindow(
  fromDate: string,
): EventOccurrenceWindow {
  const nextFromDate = getWindowEndDate(fromDate);

  return {
    events: [],
    hasMoreEvents: false,
    nextFromDate,
    windowEndDate: nextFromDate,
    windowStartDate: fromDate,
  };
}

function getWindowEndDate(fromDate: string) {
  return addDays(fromDate, PUBLIC_EVENT_WINDOW_DAYS);
}

export function getUniqueOrganizers(organizers: string[]) {
  return Array.from(new Set(organizers.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
}

export function summarizeCalendarDays(rows: SupabaseCalendarOccurrenceRow[]) {
  const summariesByDate = new Map<string, EventCalendarDaySummary>();

  rows.forEach((row) => {
    const occurrenceDate = normalizeDateValue(row.occurrence_date);
    const occurrenceStartTime = normalizeTimeValue(row.occurrence_start_time);
    const currentSummary = summariesByDate.get(occurrenceDate) ?? {
      count: 0,
      date: occurrenceDate,
      overflowCount: 0,
      samples: [],
    };

    currentSummary.count += 1;

    if (currentSummary.samples.length < CALENDAR_DAY_SAMPLE_LIMIT) {
      currentSummary.samples.push({
        id: row.id,
        primaryIssue: row.primary_issue,
        time: occurrenceStartTime,
        title: row.title,
      });
    }

    currentSummary.overflowCount = Math.max(
      0,
      currentSummary.count - currentSummary.samples.length,
    );
    summariesByDate.set(occurrenceDate, currentSummary);
  });

  return Array.from(summariesByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function compareCalendarOccurrences(
  a: SupabaseCalendarOccurrenceRow,
  b: SupabaseCalendarOccurrenceRow,
) {
  return compareOccurrences(
    {
      occurrenceDate: normalizeDateValue(a.occurrence_date),
      occurrenceStartTime: normalizeTimeValue(a.occurrence_start_time),
    },
    {
      occurrenceDate: normalizeDateValue(b.occurrence_date),
      occurrenceStartTime: normalizeTimeValue(b.occurrence_start_time),
    },
  );
}

function parseOccurrenceRows(value: unknown): SupabaseEventOccurrenceRow[] {
  if (Array.isArray(value)) {
    return value as SupabaseEventOccurrenceRow[];
  }

  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as SupabaseEventOccurrenceRow[]) : [];
  }

  return [];
}

function normalizeDateValue(date: string) {
  return date.slice(0, 10);
}

function normalizeTimeValue(time: string | null) {
  return time ? time.slice(0, 5) : null;
}

function normalizeOptionalText(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function getOrganizerDisplayName(row: {
  organizer_name: string | null;
  source_account_name: string;
}) {
  return normalizeOptionalText(row.organizer_name) ?? row.source_account_name;
}
