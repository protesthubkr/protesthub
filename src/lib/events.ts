import { clampDateKeyToMin } from "./date-key";
import { getMonthStartDate, getNextMonthStartDate } from "./format";
import { getSupabaseClient } from "./supabase";
import {
  compareCalendarOccurrences,
  getUniqueOrganizers,
  mapEventCardRow,
  mapOccurrenceWindowRpcRow,
  summarizeCalendarDays,
  type OrganizerRow,
  type SupabaseCalendarOccurrenceRow,
  type SupabaseEventCardRow,
  type SupabaseEventOccurrenceWindowRpcRow,
} from "./event-query-model";
import { PUBLIC_EVENT_WINDOW_DAYS } from "./public-event-date-policy";
import type { EventCalendarMonth, EventFilters } from "./types";

function getRequiredSupabaseClient() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  return supabase;
}

export async function getPublicEventOccurrenceWindow({
  filters,
  fromDate,
}: {
  filters: EventFilters;
  fromDate: string;
}) {
  const supabase = getRequiredSupabaseClient();
  const { data, error } = await supabase.rpc(
    "get_public_event_occurrence_window",
    {
      p_from_date: fromDate,
      p_issue_filters: filters.issues,
      p_organizer_filters: filters.organizers,
      p_region_filters: filters.regions,
      p_window_days: PUBLIC_EVENT_WINDOW_DAYS,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const rpcRow = Array.isArray(data)
    ? ((data[0] ?? null) as SupabaseEventOccurrenceWindowRpcRow | null)
    : null;

  return mapOccurrenceWindowRpcRow(rpcRow, fromDate);
}

export async function getPublicEventCalendarMonth({
  filters,
  minDate,
  month,
}: {
  filters: EventFilters;
  minDate?: string;
  month: string;
}): Promise<EventCalendarMonth> {
  const monthStartDate = getMonthStartDate(month);
  const nextMonthStartDate = getNextMonthStartDate(month);
  const queryStartDate = minDate
    ? clampDateKeyToMin(monthStartDate, minDate)
    : monthStartDate;

  if (queryStartDate >= nextMonthStartDate) {
    return {
      days: [],
      month,
      monthStartDate,
      nextMonthStartDate,
    };
  }

  const supabase = getRequiredSupabaseClient();

  let query = supabase
    .from("public_event_occurrences")
    .select(
      "id,title,primary_issue,occurrence_date,occurrence_start_time",
    )
    .gte("occurrence_date", queryStartDate)
    .lt("occurrence_date", nextMonthStartDate)
    .order("occurrence_date", { ascending: true })
    .order("occurrence_start_time", { ascending: true });

  if (filters.issues.length > 0) {
    query = query.overlaps("issue_tags", filters.issues);
  }

  if (filters.regions.length > 0) {
    query = query.in("region", filters.regions);
  }

  if (filters.organizers.length > 0) {
    query = query.in("source_account_name", filters.organizers);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return {
    days: summarizeCalendarDays(
      ((data ?? []) as SupabaseCalendarOccurrenceRow[]).sort(
        compareCalendarOccurrences,
      ),
    ),
    month,
    monthStartDate,
    nextMonthStartDate,
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
