"use server";

import { revalidatePath } from "next/cache";
import { ingestManualTelegramLink } from "@/lib/telegram/manual-link";
import { ingestManualXPost } from "@/lib/x-ingest/manual-post";
import {
  assertAdmin,
  getOptionalString,
  getRequiredString,
  getTrimmedRequiredString,
} from "./action-form-data";
import type {
  ManualTelegramLinkFormState,
  ManualXPostFormState,
} from "./action-states";
import { getAdminCandidatesHref } from "./navigation";

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
