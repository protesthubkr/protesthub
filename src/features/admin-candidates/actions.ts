"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminSecretValid } from "@/lib/admin-auth";
import {
  CANDIDATE_STATUS_FILTERS,
  type CandidateReviewScope,
  type CandidateStatus,
  type CandidateStatusFilter,
  parseCandidatePageParam,
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
import {
  hydrateCandidateDetail,
  hydratePendingCandidateDetails,
} from "@/lib/x-ingest/candidate-detail-hydration";
import { ingestManualXPost } from "@/lib/x-ingest/manual-post";
import {
  previewIgnoredCandidatePromotion,
  promoteIgnoredCandidatesForReview,
} from "@/lib/x-ingest/review-promotion";
import { runXIngest } from "@/lib/x-ingest/run";
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

export type ManualXPostFormState = {
  status: "idle" | "success" | "error";
  message: string;
  targetHref?: string;
};

export type XIngestControlState = {
  status: "idle" | "success" | "error";
  message: string;
};

const ISSUE_KEYS = ISSUE_OPTIONS.map((issue) => issue.key);
const ISSUE_KEY_SET = new Set<IssueKey>(ISSUE_KEYS);
const REGION_SET = new Set(REGION_OPTIONS);

export async function addManualXPostCandidate(
  _previousState: ManualXPostFormState,
  formData: FormData,
): Promise<ManualXPostFormState> {
  const secret = getRequiredString(formData, "secret");
  const xPostUrl = getTrimmedRequiredString(formData, "x_post_url");

  assertAdmin(secret);

  try {
    const result = await ingestManualXPost(xPostUrl);
    revalidatePath("/admin/candidates");

    return {
      status: "success",
      message: result.created
        ? `${result.sourceAccountName} 후보를 검수 대기에 추가했습니다.`
        : `${result.sourceAccountName} 후보를 검수 대기로 되돌렸습니다.`,
      targetHref: getAdminCandidatesHref({
        secret,
        status: "needs_review",
        scope: "focused",
      }),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "X 포스트를 후보로 추가하지 못했습니다.",
    };
  }
}

export async function runXIngestFromAdmin(
  _previousState: XIngestControlState,
  formData: FormData,
): Promise<XIngestControlState> {
  const secret = getRequiredString(formData, "secret");
  const mode = getXIngestMode(formData);

  assertAdmin(secret);

  try {
    if (mode === "hydrate_pending") {
      const result = await hydratePendingCandidateDetails();

      revalidatePath("/admin/candidates");

      return {
        status: "success",
        message:
          result.requested === 0
            ? "상세 수집이 필요한 검수 대기 후보가 없습니다."
            : `검수 대기 후보 ${result.requested}건 중 ${result.hydrated}건의 X 상세 정보를 수집했습니다.`,
      };
    }

    if (mode === "preview_ignored_promotion") {
      const result = await previewIgnoredCandidatePromotion();

      return {
        status: "success",
        message: formatPromotionResultMessage("미리보기", result),
      };
    }

    if (mode === "promote_ignored") {
      const result = await promoteIgnoredCandidatesForReview();

      revalidatePath("/admin/candidates");

      return {
        status: "success",
        message: formatPromotionResultMessage("승격 적용", result),
      };
    }

    const result = await runXIngest({
      refreshFollowing: mode === "refresh_following",
      hydrateMode: "deferred",
    });

    revalidatePath("/admin/candidates");

    return {
      status: "success",
      message: [
        mode === "refresh_following"
          ? "팔로잉 목록을 갱신한 뒤 수집했습니다."
          : "저장된 계정 목록으로 수집했습니다.",
        `계정 ${result.accountsSeen}개, 포스트 ${result.postsSeen}개, 신규 후보 ${result.candidatesCreated}건.`,
      ].join(" "),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "X 수집을 실행하지 못했습니다.",
    };
  }
}

function getXIngestMode(formData: FormData) {
  const mode = getRequiredString(formData, "mode");

  if (
    mode === "stored_accounts" ||
    mode === "refresh_following" ||
    mode === "hydrate_pending" ||
    mode === "preview_ignored_promotion" ||
    mode === "promote_ignored"
  ) {
    return mode;
  }

  throw new Error("Invalid X ingest mode.");
}

export async function hydrateCandidateDetailFromAdmin(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
  );

  assertAdmin(secret);

  await hydrateCandidateDetail(candidateId);

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
}

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
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
  );

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: candidateData, error: candidateError } = await supabase
    .from("x_event_candidates")
    .select("id,extraction_payload,candidate_reason")
    .eq("id", candidateId)
    .single();

  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message ?? "Candidate not found.");
  }

  const candidate = candidateData as Pick<
    CandidateForPublish,
    "id" | "extraction_payload" | "candidate_reason"
  >;
  const unpublishedByStatusChange =
    status !== "published"
      ? await deletePublicEventIfPresent(supabase, candidateId)
      : false;
  const shouldClearPublication =
    unpublishedByStatusChange || hasPublishedEventPayload(candidate);
  const adminStatusReasons = getAdminStatusReasons(status);

  const { error } = await supabase
    .from("x_event_candidates")
    .update({
      status,
      ...(shouldClearPublication
        ? {
            extraction_payload: removePublishedEventPayload(
              candidate.extraction_payload ?? {},
            ),
            candidate_reason: replacePublicationReasons(
              candidate.candidate_reason,
              ["unpublished_event", ...adminStatusReasons],
            ),
          }
        : {
            candidate_reason: mergeReasons(
              candidate.candidate_reason,
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
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
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
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
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
      candidate_reason: replacePublicationReasons(candidate.candidate_reason, [
        "published_event",
      ]),
      updated_at: now,
    })
    .eq("id", candidateId);

  if (candidateUpdateError) {
    throw new Error(candidateUpdateError.message);
  }

  revalidateAdminAndPublicPaths(eventId);
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
}

export async function unpublishCandidateEvent(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnStatus = parseCandidateStatusFilter(
    getOptionalString(formData, "return_status"),
  );
  const returnScope = parseCandidateReviewScope(
    getOptionalString(formData, "return_scope"),
  );
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
  );

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: candidateData, error: candidateError } = await supabase
    .from("x_event_candidates")
    .select("id,extraction_payload,candidate_reason")
    .eq("id", candidateId)
    .single();

  if (candidateError || !candidateData) {
    throw new Error(candidateError?.message ?? "Candidate not found.");
  }

  const candidate = candidateData as Pick<
    CandidateForPublish,
    "id" | "extraction_payload" | "candidate_reason"
  >;
  const eventId = candidate.id;
  const now = new Date().toISOString();
  await deletePublicEventIfPresent(supabase, eventId);

  const nextPayload = removePublishedEventPayload(
    candidate.extraction_payload ?? {},
  );

  const { error: candidateUpdateError } = await supabase
    .from("x_event_candidates")
    .update({
      status: "needs_review",
      extraction_payload: nextPayload,
      candidate_reason: replacePublicationReasons(candidate.candidate_reason, [
        "unpublished_event",
      ]),
      updated_at: now,
    })
    .eq("id", candidateId);

  if (candidateUpdateError) {
    throw new Error(candidateUpdateError.message);
  }

  revalidateAdminAndPublicPaths(eventId);
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
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
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
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
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
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
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
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
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
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
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
  );

  assertAdmin(secret);

  await runStructuredExtractionForCandidate(candidateId, {
    inputMode: "post_text_and_ocr",
  });

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
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
  const returnPage = parseCandidatePageParam(
    getOptionalString(formData, "return_page"),
  );

  assertAdmin(secret);

  await runStructuredExtractionForCandidate(candidateId, {
    inputMode: "post_text_only",
  });

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnStatus, returnScope, returnPage));
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

async function deletePublicEventIfPresent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
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

function hasPublishedEventPayload(
  candidate: Pick<CandidateForPublish, "extraction_payload" | "candidate_reason">,
) {
  return Boolean(
    candidate.extraction_payload?.published_event ||
      candidate.candidate_reason.includes("published_event"),
  );
}

function replacePublicationReasons(
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

function getAdminStatusReasons(status: CandidateStatus) {
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

function formatPromotionResultMessage(
  label: string,
  result: Awaited<ReturnType<typeof previewIgnoredCandidatePromotion>>,
) {
  return [
    `${label}: ignored ${result.scanned}건 검사, 승격 대상 ${result.eligible}건, 적용 ${result.promoted}건.`,
    `제외: 수동/변경됨 ${result.skipped.alreadyTouched}건, 규칙 미충족 ${result.skipped.noReviewRule}건, 과거 일정 ${result.skipped.pastEventDate}건, 보호된 판단 ${result.skipped.protectedDecision}건, 공개 일정 중복 ${result.skipped.publicEventOverlap}건.`,
  ].join(" ");
}

function removePublishedEventPayload(payload: Record<string, unknown>) {
  const nextPayload = { ...payload };
  delete nextPayload.published_event;
  return nextPayload;
}

function revalidateAdminAndPublicPaths(eventId: string) {
  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events/[id]", "page");
  revalidatePath("/api/events");
  revalidatePath("/api/events/calendar");
  revalidatePath("/admin/candidates");
}

function getAdminRedirectPath(
  secret: string,
  returnStatus: CandidateStatusFilter,
  returnScope: CandidateReviewScope,
  returnPage: number,
) {
  return getAdminCandidatesHref({
    page: returnPage,
    secret,
    status: returnStatus,
    scope: returnScope,
  });
}
