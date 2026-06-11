import { revalidatePath } from "next/cache";
import type { CandidateStatus } from "@/lib/admin-candidates/types";
import { clearPublicEventCalendarCache } from "@/lib/events";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type AdminSupabaseClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type CandidateForPublish = {
  id: string;
  status: CandidateStatus;
  source_name: string;
  source_url: string;
  media_keys: string[];
  extraction_payload: Record<string, unknown> | null;
  review_reason: string[];
};

export type CandidatePublicationState = Pick<
  CandidateForPublish,
  "id" | "extraction_payload" | "review_reason"
>;

export async function getCandidateForPublish(
  supabase: AdminSupabaseClient,
  candidateId: string,
) {
  const { data, error } = await supabase
    .from("review_candidates")
    .select(
      [
        "id",
        "status",
        "source_name",
        "source_url",
        "media_keys",
        "extraction_payload",
        "review_reason",
      ].join(","),
    )
    .eq("id", candidateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Candidate not found.");
  }

  return data as unknown as CandidateForPublish;
}

export async function getCandidatePublicationState(
  supabase: AdminSupabaseClient,
  candidateId: string,
) {
  const { data, error } = await supabase
    .from("review_candidates")
    .select("id,extraction_payload,review_reason")
    .eq("id", candidateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Candidate not found.");
  }

  return data as CandidatePublicationState;
}

export async function deletePublicEventIfPresent(
  supabase: AdminSupabaseClient,
  eventId: string,
) {
  const { data, error } = await supabase
    .from("public_events")
    .delete()
    .eq("id", eventId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.length);
}

export async function hasPublicEvent(
  supabase: AdminSupabaseClient,
  eventId: string,
) {
  const { data, error } = await supabase
    .from("public_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export function hasPublishedEventPayload(candidate: CandidatePublicationState) {
  return Boolean(
      candidate.extraction_payload?.published_event ||
      candidate.review_reason.includes("published_event"),
  );
}

export function replacePublicationReasons(
  currentReasons: string[],
  nextReasons: string[],
) {
  return Array.from(
    new Set([
      ...currentReasons.filter(
        (reason) =>
          reason !== "published_event" && reason !== "unpublished_event",
      ),
      ...nextReasons,
    ]),
  );
}

export function getAdminStatusReasons(status: CandidateStatus) {
  switch (status) {
    case "ignored":
      return ["admin_ignored"];
    case "duplicate":
      return ["admin_duplicate"];
    case "canceled":
      return ["admin_canceled_candidate"];
    case "needs_review":
      return ["admin_reopened"];
    case "published":
      return [];
  }
}

export function removePublishedEventPayload(payload: Record<string, unknown>) {
  const nextPayload = { ...payload };
  delete nextPayload.published_event;
  return nextPayload;
}

export function revalidateAdminAndPublicPaths(eventId: string) {
  clearPublicEventCalendarCache();
  revalidatePath("/");
  revalidatePath("/list");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events/[id]", "page");
  revalidatePath("/api/events");
  revalidatePath("/api/events/calendar");
  revalidatePath("/admin/candidates");
}
