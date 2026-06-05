import { addDays, compareOccurrences } from "./format";
import { getSupabaseClient } from "./supabase";
import type {
  EventFilters,
  EventListOccurrence,
  IssueKey,
  PublicEvent,
} from "./types";

const DAYS_PER_EVENT_WINDOW = 7;

type SupabaseEventCardRow = {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  address: string;
  region: string;
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
  source_account_name: string;
  issue_tags: IssueKey[];
  primary_issue: IssueKey;
  occurrence_date: string;
  occurrence_start_time: string | null;
};

type OrganizerRow = {
  source_account_name: string;
};

function mapEventCardRow(row: SupabaseEventCardRow): PublicEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    venue: row.venue,
    address: row.address,
    region: row.region,
    sourceAccountName: row.source_account_name,
    sourcePostUrl: row.source_post_url,
    cancelSourceUrl: row.cancel_source_url ?? undefined,
    issueTags: row.issue_tags,
    primaryIssue: row.primary_issue,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    posterImageUrl: row.poster_image_url ?? undefined,
    dates: row.dates.map((date) => ({
      date: date.date,
      startTime: date.start_time,
    })),
  };
}

function mapOccurrenceRow(
  row: SupabaseEventOccurrenceRow,
): EventListOccurrence {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    region: row.region,
    sourceAccountName: row.source_account_name,
    issueTags: row.issue_tags,
    primaryIssue: row.primary_issue,
    occurrenceDate: row.occurrence_date,
    occurrenceStartTime: row.occurrence_start_time,
  };
}

function getRequiredSupabaseClient() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  return supabase;
}

function getWindowEndDate(fromDate: string) {
  return addDays(fromDate, DAYS_PER_EVENT_WINDOW);
}

export async function getPublicEventOccurrenceWindow({
  filters,
  fromDate,
}: {
  filters: EventFilters;
  fromDate: string;
}) {
  const supabase = getRequiredSupabaseClient();
  const nextFromDate = getWindowEndDate(fromDate);
  const baseSelect =
    "id,title,venue,region,source_account_name,issue_tags,primary_issue,occurrence_date,occurrence_start_time";

  let windowQuery = supabase
    .from("public_event_occurrences")
    .select(baseSelect)
    .gte("occurrence_date", fromDate)
    .lt("occurrence_date", nextFromDate)
    .order("occurrence_date", { ascending: true })
    .order("occurrence_start_time", { ascending: true });
  let futureQuery = supabase
    .from("public_event_occurrences")
    .select("id")
    .gte("occurrence_date", nextFromDate)
    .limit(1);

  if (filters.issues.length > 0) {
    windowQuery = windowQuery.overlaps("issue_tags", filters.issues);
    futureQuery = futureQuery.overlaps("issue_tags", filters.issues);
  }

  if (filters.regions.length > 0) {
    windowQuery = windowQuery.in("region", filters.regions);
    futureQuery = futureQuery.in("region", filters.regions);
  }

  if (filters.organizers.length > 0) {
    windowQuery = windowQuery.in("source_account_name", filters.organizers);
    futureQuery = futureQuery.in("source_account_name", filters.organizers);
  }

  const [windowResult, futureResult] = await Promise.all([
    windowQuery,
    futureQuery,
  ]);

  if (windowResult.error) {
    throw new Error(windowResult.error.message);
  }

  if (futureResult.error) {
    throw new Error(futureResult.error.message);
  }

  return {
    events: ((windowResult.data ?? []) as SupabaseEventOccurrenceRow[])
      .map(mapOccurrenceRow)
      .sort(compareOccurrences),
    hasMoreEvents: Boolean(futureResult.data?.length),
    nextFromDate,
  };
}

export async function getPublishedOrganizerOptions() {
  const supabase = getRequiredSupabaseClient();
  const { data, error } = await supabase
    .from("public_events")
    .select("source_account_name")
    .eq("status", "published")
    .order("source_account_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return getUniqueOrganizers(
    ((data ?? []) as OrganizerRow[]).map((row) => row.source_account_name),
  );
}

export async function getEventById(id: string) {
  const supabase = getRequiredSupabaseClient();
  const { data, error } = await supabase
    .from("public_event_cards")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapEventCardRow(data as SupabaseEventCardRow) : null;
}

function getUniqueOrganizers(organizers: string[]) {
  return Array.from(new Set(organizers.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
}
