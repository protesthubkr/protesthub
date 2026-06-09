"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runStructuredExtractionForCandidate } from "@/lib/pipeline/structured-extraction";
import { loadTelegramCandidateImages } from "@/lib/telegram/candidate-images";
import { hydrateCandidateDetail } from "@/lib/x-ingest/candidate-detail-hydration";
import {
  assertAdmin,
  getAdminRedirectPath,
  getAdminReturnState,
  getOptionalString,
  getRequiredString,
} from "./action-form-data";
import {
  createCandidateOcrUpdate,
  getCandidateForOcr,
} from "./candidate-ocr";
import { getRequiredSupabaseAdminClient } from "./action-utils";

export async function hydrateCandidateDetailFromAdmin(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  await hydrateCandidateDetail(candidateId);

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnState));
}

export async function loadTelegramCandidateImagesFromAdmin(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  await loadTelegramCandidateImages(candidateId);

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnState));
}

export async function updateCandidateOcrText(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const ocrText = getOptionalString(formData, "ocr_text") ?? "";
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getRequiredSupabaseAdminClient();
  const { error } = await supabase
    .from("review_candidates")
    .update({
      ocr_text: ocrText.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnState));
}

export async function runCandidateOcr(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getRequiredSupabaseAdminClient();
  const candidate = await getCandidateForOcr(supabase, candidateId);
  const ocrUpdate = await createCandidateOcrUpdate(candidate);
  const { error: updateError } = await supabase
    .from("review_candidates")
    .update({
      status: ocrUpdate.status,
      ocr_text: ocrUpdate.ocrText,
      extraction_payload: ocrUpdate.extractionPayload,
      review_reason: ocrUpdate.candidateReason,
      updated_at: ocrUpdate.updatedAt,
    })
    .eq("id", candidateId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnState));
}

export async function runCandidateStructuredExtraction(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  await runStructuredExtractionForCandidate(candidateId, {
    inputMode: "post_text_and_ocr",
  });

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnState));
}

export async function runCandidateTextOnlyStructuredExtraction(
  formData: FormData,
) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  await runStructuredExtractionForCandidate(candidateId, {
    inputMode: "post_text_only",
  });

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnState));
}
