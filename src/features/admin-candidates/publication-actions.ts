"use server";

import { redirect } from "next/navigation";
import { getStoredStructuredEvent } from "@/lib/structured-event-storage";
import {
  assertAdmin,
  getAdminRedirectPath,
  getAdminReturnState,
  getOptionalString,
  getPublishEventDates,
  getRequiredString,
  getTrimmedRequiredString,
  getValidIssueTags,
  getValidPrimaryIssue,
  getValidRegion,
} from "./action-form-data";
import { getRequiredSupabaseAdminClient } from "./action-utils";
import { getFirstCandidateImageUrl } from "./candidate-ocr";
import {
  deletePublicEventIfPresent,
  getCandidateForPublish,
  getCandidatePublicationState,
  hasPublicEvent,
  removePublishedEventPayload,
  replacePublicationReasons,
  revalidateAdminAndPublicPaths,
} from "./candidate-publication";

export async function publishCandidateEvent(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getRequiredSupabaseAdminClient();
  const candidate = await getCandidateForPublish(supabase, candidateId);

  if (
    !getStoredStructuredEvent(candidate.extraction_payload) &&
    !(await hasPublicEvent(supabase, candidateId))
  ) {
    throw new Error("공개하려면 먼저 구조화 추출을 실행해야 합니다.");
  }

  const eventId = candidate.id;
  const now = new Date().toISOString();
  const title = getTrimmedRequiredString(formData, "title");
  const venue = getTrimmedRequiredString(formData, "venue");
  const address = getOptionalString(formData, "address")?.trim() ?? "";
  const organizerName =
    getOptionalString(formData, "organizer_name")?.trim() || null;
  const region = getValidRegion(formData);
  const issueTags = getValidIssueTags(formData);
  const primaryIssue = getValidPrimaryIssue(formData, issueTags);
  const eventDates = getPublishEventDates(formData);
  const posterImageUrl =
    getOptionalString(formData, "poster_image_url")?.trim() ||
    (await getFirstCandidateImageUrl(candidate.media_keys));

  const { error: publicEventError } = await supabase
    .from("public_events")
    .upsert(
      {
        id: eventId,
        title,
        venue,
        address,
        region,
        organizer_name: organizerName,
        source_account_name: candidate.source_name,
        source_post_url: candidate.source_url,
        cancel_source_url: null,
        issue_tags: issueTags,
        primary_issue: primaryIssue,
        status: "published",
        last_checked_at: now,
        poster_image_url: posterImageUrl || null,
      },
      { onConflict: "id" },
    );

  if (publicEventError) {
    throw new Error(publicEventError.message);
  }

  const { error: deleteDatesError } = await supabase
    .from("event_dates")
    .delete()
    .eq("event_id", eventId);

  if (deleteDatesError) {
    throw new Error(deleteDatesError.message);
  }

  const { error: insertDatesError } = await supabase.from("event_dates").insert(
    eventDates.map((date) => ({
      event_id: eventId,
      event_date: date.date,
      start_time: date.startTime,
    })),
  );

  if (insertDatesError) {
    throw new Error(insertDatesError.message);
  }

  const nextPayload = {
    ...(candidate.extraction_payload ?? {}),
    published_event: {
      event_id: eventId,
      ran_at: now,
    },
  };

  const { error: candidateUpdateError } = await supabase
    .from("review_candidates")
    .update({
      status: "published",
      extraction_payload: nextPayload,
      review_reason: replacePublicationReasons(candidate.review_reason, [
        "published_event",
      ]),
      updated_at: now,
    })
    .eq("id", candidateId);

  if (candidateUpdateError) {
    throw new Error(candidateUpdateError.message);
  }

  revalidateAdminAndPublicPaths(eventId);
  redirect(getAdminRedirectPath(secret, returnState));
}

export async function unpublishCandidateEvent(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getRequiredSupabaseAdminClient();
  const candidate = await getCandidatePublicationState(supabase, candidateId);
  const eventId = candidate.id;
  const now = new Date().toISOString();
  await deletePublicEventIfPresent(supabase, eventId);

  const nextPayload = removePublishedEventPayload(
    candidate.extraction_payload ?? {},
  );

  const { error: candidateUpdateError } = await supabase
    .from("review_candidates")
    .update({
      status: "needs_review",
      extraction_payload: nextPayload,
      review_reason: replacePublicationReasons(candidate.review_reason, [
        "unpublished_event",
      ]),
      updated_at: now,
    })
    .eq("id", candidateId);

  if (candidateUpdateError) {
    throw new Error(candidateUpdateError.message);
  }

  revalidateAdminAndPublicPaths(eventId);
  redirect(getAdminRedirectPath(secret, returnState));
}
