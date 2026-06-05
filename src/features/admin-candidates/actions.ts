"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminSecretValid } from "@/lib/admin-auth";
import {
  CANDIDATE_STATUS_FILTERS,
  type CandidateReviewScope,
  type CandidateStatus,
  type CandidateStatusFilter,
  parseCandidateReviewScope,
  parseCandidateStatusFilter,
} from "@/lib/admin-candidates";
import { analyzePastEventNotice } from "@/lib/event-date-filter";
import { ISSUE_OPTIONS } from "@/lib/issues";
import { runOpenAiPosterOcr, type OcrImage } from "@/lib/ocr/openai";
import { getOcrCandidateReasons } from "@/lib/ocr/signals";
import { runStructuredExtractionForCandidate } from "@/lib/pipeline/structured-extraction";
import { REGION_OPTIONS } from "@/lib/regions";
import { hasStoredStructuredEvent } from "@/lib/structured-event-storage";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { IssueKey } from "@/lib/types";
import { getAdminCandidatesHref } from "./navigation";

type CandidateForOcr = {
  id: string;
  status: CandidateStatus;
  text_snapshot: string;
  media_keys: string[];
  extraction_payload: Record<string, unknown> | null;
  candidate_reason: string[];
};

type MediaForOcr = {
  media_key: string;
  url: string | null;
  preview_image_url: string | null;
};

type CandidateForPublish = {
  id: string;
  status: CandidateStatus;
  source_account_name: string;
  source_post_url: string;
  media_keys: string[];
  extraction_payload: Record<string, unknown> | null;
  candidate_reason: string[];
};

type PublishEventDate = {
  date: string;
  startTime: string | null;
};

const ISSUE_KEYS = ISSUE_OPTIONS.map((issue) => issue.key);
const ISSUE_KEY_SET = new Set<IssueKey>(ISSUE_KEYS);
const REGION_SET = new Set(REGION_OPTIONS);

export async function updateCandidateStatus(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const status = getCandidateStatus(formData);
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { error } = await supabase
    .from("x_event_candidates")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope));
}

export async function publishCandidateEvent(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: candidateData, error: candidateError } = await supabase
    .from("x_event_candidates")
    .select(
      [
        "id",
        "status",
        "source_account_name",
        "source_post_url",
        "media_keys",
        "extraction_payload",
        "candidate_reason",
      ].join(","),
    )
    .eq("id", candidateId)
    .single();

  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message ?? "Candidate not found.");
  }

  const candidate = candidateData as unknown as CandidateForPublish;

  if (!hasStoredStructuredEvent(candidate.extraction_payload)) {
    throw new Error("공개하려면 먼저 구조화 추출을 실행해야 합니다.");
  }

  const eventId = candidate.id;
  const now = new Date().toISOString();
  const title = getTrimmedRequiredString(formData, "title");
  const description = getOptionalString(formData, "description")?.trim() ?? "";
  const venue = getTrimmedRequiredString(formData, "venue");
  const address = getOptionalString(formData, "address")?.trim() ?? "";
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
        description,
        venue,
        address,
        region,
        source_account_name: candidate.source_account_name,
        source_post_url: candidate.source_post_url,
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
    .from("x_event_candidates")
    .update({
      status: "published",
      extraction_payload: nextPayload,
      candidate_reason: mergeReasons(candidate.candidate_reason, [
        "published_event",
      ]),
      updated_at: now,
    })
    .eq("id", candidateId);

  if (candidateUpdateError) {
    throw new Error(candidateUpdateError.message);
  }

  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events/[id]", "page");
  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope));
}

export async function updateCandidateOcrText(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const ocrText = getOptionalString(formData, "ocr_text") ?? "";
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { error } = await supabase
    .from("x_event_candidates")
    .update({
      ocr_text: ocrText.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope));
}

export async function runCandidateOcr(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: candidateData, error: candidateError } = await supabase
    .from("x_event_candidates")
    .select(
      "id,status,text_snapshot,media_keys,extraction_payload,candidate_reason",
    )
    .eq("id", candidateId)
    .single();

  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message ?? "Candidate not found.");
  }

  const candidate = candidateData as CandidateForOcr;
  const media = await getMediaForOcr(candidate.media_keys);
  const images = media
    .map((item) => ({
      mediaKey: item.media_key,
      imageUrl: item.url ?? item.preview_image_url,
    }))
    .filter((item): item is OcrImage => Boolean(item.imageUrl));

  if (images.length === 0) {
    throw new Error("OCR을 실행할 이미지 URL이 없습니다.");
  }

  const ocr = await runOpenAiPosterOcr(images);
  const now = new Date().toISOString();
  const eventDateFilter = analyzePastEventNotice(
    `${candidate.text_snapshot}\n${ocr.text}`,
  );
  const nextReasons = mergeReasons(
    candidate.candidate_reason,
    eventDateFilter.ignoredAsPast
      ? [...getOcrCandidateReasons(ocr.text), "past_event_date"]
      : getOcrCandidateReasons(ocr.text),
  );
  const nextPayload = {
    ...(candidate.extraction_payload ?? {}),
    event_date_filter: eventDateFilter,
    ocr: {
      provider: ocr.provider,
      model: ocr.model,
      ran_at: now,
      image_count: images.length,
      media_keys: images.map((image) => image.mediaKey),
    },
  };

  const { error: updateError } = await supabase
    .from("x_event_candidates")
    .update({
      status: eventDateFilter.ignoredAsPast ? "ignored" : candidate.status,
      ocr_text: ocr.text || null,
      extraction_payload: nextPayload,
      candidate_reason: nextReasons,
      updated_at: now,
    })
    .eq("id", candidateId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope));
}

export async function runCandidateStructuredExtraction(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );

  assertAdmin(secret);

  await runStructuredExtractionForCandidate(candidateId, {
    inputMode: "post_text_and_ocr",
  });

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope));
}

export async function runCandidateTextOnlyStructuredExtraction(
  formData: FormData,
) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );

  assertAdmin(secret);

  await runStructuredExtractionForCandidate(candidateId, {
    inputMode: "post_text_only",
  });

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope));
}

function assertAdmin(secret: string) {
  if (!isAdminSecretValid(secret)) {
    throw new Error("Unauthorized admin action.");
  }
}

function getCandidateStatus(formData: FormData): CandidateStatus {
  const status = getRequiredString(formData, "status");

  if (
    status === "all" ||
    !CANDIDATE_STATUS_FILTERS.includes(status as CandidateStatusFilter)
  ) {
    throw new Error(`Invalid candidate status: ${status}`);
  }

  return status as CandidateStatus;
}

function getRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || !value) {
    throw new Error(`Missing form value: ${key}`);
  }

  return value;
}

function getTrimmedRequiredString(formData: FormData, key: string) {
  const value = getRequiredString(formData, key).trim();

  if (!value) {
    throw new Error(`Missing form value: ${key}`);
  }

  return value;
}

function getOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function getValidRegion(formData: FormData) {
  const region = getTrimmedRequiredString(formData, "region");

  if (!REGION_SET.has(region)) {
    throw new Error(`Invalid region: ${region}`);
  }

  return region;
}

function getValidIssueTags(formData: FormData) {
  const tags = formData
    .getAll("issue_tags")
    .filter((tag): tag is IssueKey =>
      typeof tag === "string" && ISSUE_KEY_SET.has(tag as IssueKey),
    );
  const uniqueTags = Array.from(new Set(tags));

  if (uniqueTags.length === 0) {
    throw new Error("공개하려면 의제 태그를 하나 이상 선택해야 합니다.");
  }

  return uniqueTags;
}

function getValidPrimaryIssue(formData: FormData, issueTags: IssueKey[]) {
  const primaryIssue = getTrimmedRequiredString(formData, "primary_issue");

  if (!ISSUE_KEY_SET.has(primaryIssue as IssueKey)) {
    throw new Error(`Invalid primary issue: ${primaryIssue}`);
  }

  if (!issueTags.includes(primaryIssue as IssueKey)) {
    return issueTags[0];
  }

  return primaryIssue as IssueKey;
}

function getPublishEventDates(formData: FormData) {
  const dateValues = formData.getAll("event_date");
  const timeValues = formData.getAll("start_time");
  const dates = dateValues
    .map((dateValue, index): PublishEventDate | null => {
      if (typeof dateValue !== "string") {
        return null;
      }

      const date = dateValue.trim();

      if (!date) {
        return null;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid event date: ${date}`);
      }

      const timeValue = timeValues[index];
      const startTime =
        typeof timeValue === "string" && timeValue.trim()
          ? timeValue.trim()
          : null;

      if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
        throw new Error(`Invalid event start time: ${startTime}`);
      }

      return { date, startTime };
    })
    .filter((date): date is PublishEventDate => Boolean(date));

  if (dates.length === 0) {
    throw new Error("공개하려면 날짜를 하나 이상 입력해야 합니다.");
  }

  return dates;
}

async function getFirstCandidateImageUrl(mediaKeys: string[]) {
  const media = await getMediaForOcr(mediaKeys);
  const firstImage = media.find((item) => item.url || item.preview_image_url);
  return firstImage?.url ?? firstImage?.preview_image_url ?? "";
}

async function getMediaForOcr(mediaKeys: string[]) {
  const supabase = getSupabaseAdminClient();

  if (!supabase || mediaKeys.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("x_media")
    .select("media_key,url,preview_image_url")
    .in("media_key", mediaKeys);

  if (error || !data) {
    throw new Error(error?.message ?? "OCR media not found.");
  }

  return data as MediaForOcr[];
}

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}

function getAdminRedirectPath(
  secret: string,
  returnStatus: CandidateStatusFilter,
  returnScope: CandidateReviewScope,
) {
  return getAdminCandidatesHref({
    secret,
    status: returnStatus,
    scope: returnScope,
  });
}
