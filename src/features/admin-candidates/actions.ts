"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runStructuredExtractionForCandidate } from "@/lib/pipeline/structured-extraction";
import { getStoredStructuredEvent } from "@/lib/structured-event-storage";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  addTelegramChannelSubscription,
  deleteTelegramChannelSubscription,
  scanTelegramChannelSubscriptions,
  updateTelegramChannelSubscriptionStatus,
} from "@/lib/telegram/channel-subscriptions";
import { loadTelegramCandidateImages } from "@/lib/telegram/candidate-images";
import { ingestManualTelegramLink } from "@/lib/telegram/manual-link";
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
import {
  assertAdmin,
  getAdminRedirectPath,
  getAdminReturnState,
  getCandidateStatus,
  getOptionalString,
  getPublishEventDates,
  getRequiredString,
  getTrimmedRequiredString,
  getValidIssueTags,
  getValidPrimaryIssue,
  getValidRegion,
} from "./action-form-data";
import {
  createCandidateOcrUpdate,
  getCandidateForOcr,
  getFirstCandidateImageUrl,
} from "./candidate-ocr";
import {
  deletePublicEventIfPresent,
  getAdminStatusReasons,
  getCandidateForPublish,
  getCandidatePublicationState,
  hasPublicEvent,
  hasPublishedEventPayload,
  removePublishedEventPayload,
  replacePublicationReasons,
  revalidateAdminAndPublicPaths,
} from "./candidate-publication";
import { getAdminCandidatesHref } from "./navigation";

export type ManualXPostFormState = {
  status: "idle" | "success" | "error";
  message: string;
  targetHref?: string;
};

export type ManualTelegramLinkFormState = ManualXPostFormState;

export type XIngestControlState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type TelegramChannelControlState = XIngestControlState;

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

export async function addManualTelegramCandidate(
  _previousState: ManualTelegramLinkFormState,
  formData: FormData,
): Promise<ManualTelegramLinkFormState> {
  const secret = getRequiredString(formData, "secret");
  const telegramUrl = getTrimmedRequiredString(formData, "telegram_url");
  const manualText = getOptionalString(formData, "telegram_message_text");

  assertAdmin(secret);

  try {
    const result = await ingestManualTelegramLink({
      manualText,
      rawUrl: telegramUrl,
    });
    revalidatePath("/admin/candidates");

    return {
      status: "success",
      message: result.created
        ? `${result.sourceName} 후보를 검수 대기에 추가했습니다.`
        : `${result.sourceName} 후보를 검수 대기로 되돌렸습니다.`,
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
          : "텔레그램 링크를 후보로 추가하지 못했습니다.",
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

export async function addTelegramChannelSubscriptionFromAdmin(
  _previousState: TelegramChannelControlState,
  formData: FormData,
): Promise<TelegramChannelControlState> {
  const secret = getRequiredString(formData, "secret");
  const channelInput = getTrimmedRequiredString(formData, "telegram_channel");

  assertAdmin(secret);

  try {
    const subscription = await addTelegramChannelSubscription(channelInput);

    revalidatePath("/admin/candidates");

    return {
      status: "success",
      message: `${subscription.channelTitle} 채널을 구독 목록에 추가했습니다.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "텔레그램 채널 구독을 추가하지 못했습니다.",
    };
  }
}

export async function runTelegramChannelScanFromAdmin(
  _previousState: TelegramChannelControlState,
  formData: FormData,
): Promise<TelegramChannelControlState> {
  const secret = getRequiredString(formData, "secret");
  const subscriptionId = getOptionalString(formData, "subscription_id");

  assertAdmin(secret);

  try {
    const result = await scanTelegramChannelSubscriptions({
      subscriptionId: subscriptionId || undefined,
    });

    revalidatePath("/admin/candidates");

    return {
      status: "success",
      message:
        result.channelsScanned === 0
          ? "수집할 활성 텔레그램 채널이 없습니다."
          : `텔레그램 채널 ${result.channelsScanned}개에서 메시지 ${result.messagesSeen}건을 확인했고 신규 후보 ${result.candidatesCreated}건을 추가했습니다. 검수 대기 ${result.needsReviewCreated}건, 무시 ${result.ignoredCreated}건.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "텔레그램 채널 수집을 실행하지 못했습니다.",
    };
  }
}

export async function updateTelegramChannelSubscriptionFromAdmin(
  formData: FormData,
) {
  const secret = getRequiredString(formData, "secret");
  const subscriptionId = getRequiredString(formData, "subscription_id");
  const action = getRequiredString(formData, "subscription_action");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  if (action === "pause") {
    await updateTelegramChannelSubscriptionStatus({
      id: subscriptionId,
      status: "paused",
    });
  } else if (action === "resume") {
    await updateTelegramChannelSubscriptionStatus({
      id: subscriptionId,
      status: "active",
    });
  } else if (action === "delete") {
    await deleteTelegramChannelSubscription(subscriptionId);
  } else {
    throw new Error("Invalid telegram subscription action.");
  }

  revalidatePath("/admin/candidates");
  redirect(getAdminRedirectPath(secret, returnState));
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

export async function updateCandidateStatus(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const status = getCandidateStatus(formData);
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

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

export async function publishCandidateEvent(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

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

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

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

export async function updateCandidateOcrText(formData: FormData) {
  const secret = getRequiredString(formData, "secret");
  const candidateId = getRequiredString(formData, "candidate_id");
  const ocrText = getOptionalString(formData, "ocr_text") ?? "";
  const returnState = getAdminReturnState(formData);

  assertAdmin(secret);

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

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

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

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

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
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
