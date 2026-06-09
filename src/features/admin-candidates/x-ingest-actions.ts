"use server";

import { revalidatePath } from "next/cache";
import {
  hydratePendingCandidateDetails,
} from "@/lib/x-ingest/candidate-detail-hydration";
import {
  previewIgnoredCandidatePromotion,
  promoteIgnoredCandidatesForReview,
} from "@/lib/x-ingest/review-promotion";
import { runXIngest, XApiError } from "@/lib/x-ingest/run";
import { assertAdmin, getRequiredString } from "./action-form-data";
import type { XIngestControlState } from "./action-states";

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
        refreshKey: Date.now(),
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
        refreshKey: Date.now(),
        message: formatPromotionResultMessage("미리보기", result),
      };
    }

    if (mode === "promote_ignored") {
      const result = await promoteIgnoredCandidatesForReview();

      revalidatePath("/admin/candidates");

      return {
        status: "success",
        refreshKey: Date.now(),
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
      refreshKey: Date.now(),
      message: [
        mode === "refresh_following"
          ? "팔로잉 목록을 갱신한 뒤 수집했습니다."
          : "저장된 계정 목록으로 수집했습니다.",
        `계정 ${result.accountsSeen}개, 확인 포스트 ${result.postsSeen}개, 신규 저장 포스트 ${result.postsWritten}건.`,
        `신규 후보 ${result.candidatesCreated}건(검수 대기 ${result.needsReviewCandidatesCreated}건, 무시 ${result.ignoredCandidatesCreated}건).`,
        result.candidatesPromoted > 0
          ? `기존 ignored 재검수 ${result.candidatesPromoted}건.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (error) {
    return {
      status: "error",
      message: formatXIngestErrorMessage(error),
    };
  }
}

function formatXIngestErrorMessage(error: unknown) {
  if (error instanceof XApiError) {
    const retryText =
      error.attempts > 1 ? `${error.attempts}회 시도 후에도 ` : "";

    if (error.status === 503) {
      return `X API가 일시적으로 불안정합니다(503). ${retryText}실패했습니다. 잠시 뒤 다시 실행해주세요.`;
    }

    return `X API 요청이 실패했습니다(${error.status}). ${retryText}수집을 완료하지 못했습니다.`;
  }

  return error instanceof Error
    ? error.message
    : "X 수집을 실행하지 못했습니다.";
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

function formatPromotionResultMessage(
  label: string,
  result: Awaited<ReturnType<typeof previewIgnoredCandidatePromotion>>,
) {
  return [
    `${label}: ignored ${result.scanned}건 검사, 승격 대상 ${result.eligible}건, 적용 ${result.promoted}건.`,
    `제외: 수동/변경됨 ${result.skipped.alreadyTouched}건, 규칙 미충족 ${result.skipped.noReviewRule}건, 과거 일정 ${result.skipped.pastEventDate}건, 보호된 판단 ${result.skipped.protectedDecision}건, 공개 일정 중복 ${result.skipped.publicEventOverlap}건.`,
  ].join(" ");
}
