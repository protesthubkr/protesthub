"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTelegramChannelSubscription,
  deleteTelegramChannelSubscription,
  updateTelegramChannelSubscriptionStatus,
} from "@/lib/telegram/channel-subscription-repository";
import { scanTelegramChannelSubscriptions } from "@/lib/telegram/channel-subscription-scan";
import {
  assertAdmin,
  getAdminRedirectPath,
  getAdminReturnState,
  getOptionalString,
  getRequiredString,
  getTrimmedRequiredString,
} from "./action-form-data";
import type { TelegramChannelControlState } from "./action-states";

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
      refreshKey: Date.now(),
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
      refreshKey: Date.now(),
      message:
        result.channelsScanned === 0
          ? "수집할 활성 텔레그램 채널이 없습니다."
          : [
              `텔레그램 채널 ${result.channelsScanned}개에서 메시지 ${result.messagesSeen}건을 확인했고 신규 후보 ${result.candidatesCreated}건을 추가했습니다.`,
              `검수 대기 ${result.needsReviewCreated}건, 무시 ${result.ignoredCreated}건.`,
              result.candidatesPromoted > 0
                ? `기존 ignored 재검수 ${result.candidatesPromoted}건.`
                : "",
              result.candidatesRefreshed > 0
                ? `기존 자동 후보 갱신 ${result.candidatesRefreshed}건.`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
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
