import { MOCK_EVENTS } from "./mock-events";
import { getSupabaseClient } from "./supabase";
import type { EventOccurrence, IssueKey, PublicEvent } from "./types";

type SupabaseEventRow = {
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

function mapRow(row: SupabaseEventRow): PublicEvent {
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

async function fetchSupabaseEvents() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("public_event_cards")
    .select("*")
    .order("id", { ascending: true });

  if (error || !data) {
    return null;
  }

  return (data as SupabaseEventRow[]).map(mapRow);
}

export async function getEvents() {
  return (await fetchSupabaseEvents()) ?? MOCK_EVENTS;
}

export async function getPublicEventOccurrences() {
  const events = await getEvents();

  return events
    .filter((event) => event.status === "published")
    .flatMap((event): EventOccurrence[] =>
      event.dates.map((date) => ({
        ...event,
        occurrenceDate: date.date,
        occurrenceStartTime: date.startTime,
      })),
    );
}

export async function getEventById(id: string) {
  const events = await getEvents();
  return events.find((event) => event.id === id) ?? null;
}
