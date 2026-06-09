"use server";

import { redirect } from "next/navigation";
import {
  assertAdmin,
  getAdminRedirectPath,
  getAdminReturnState,
  getCandidateStatus,
  getRequiredString,
} from "./action-form-data";
import { getRequiredSupabaseAdminClient, mergeReasons } from "./action-utils";
import {
  deletePublicEventIfPresent,
  getAdminStatusReasons,
  getCandidatePublicationState,
  hasPublishedEventPayload,
  removePublishedEventPayload,
  replacePublicationReasons,
  revalidateAdminAndPublicPaths,
} from "./candidate-publication";

export async function updateCandidateStatus(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const status = getCandidateStatus(formData);
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getRequiredSupabaseAdminClient();
  const candidate = await getCandidatePublicationState(supabase, candidateId);
  const unpublishedByStatusChange =
    status !== "published"
      ? await deletePublicEventIfPresent(supabase, candidateId)
      : false;
  const shouldClearPublication =
    unpublishedByStatusChange || hasPublishedEventPayload(candidate);
  const adminStatusReasons = getAdminStatusReasons(status);

  const { error } = await supabase
    .from("review_candidates")
    .update({
      status,
      ...(shouldClearPublication
        ? {
            extraction_payload: removePublishedEventPayload(
              candidate.extraction_payload ?? {},
            ),
            review_reason: replacePublicationReasons(
              candidate.review_reason,
              ["unpublished_event", ...adminStatusReasons],
            ),
          }
        : {
            review_reason: mergeReasons(
              candidate.review_reason,
              adminStatusReasons,
            ),
          }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateAdminAndPublicPaths(candidateId);
  redirect(getAdminRedirectPath(secret, returnState));
}
