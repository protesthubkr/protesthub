"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  CandidateReviewScope,
  CandidateStatusFilter,
} from "@/lib/admin-candidates";
import type { TelegramChannelSubscription } from "@/lib/telegram/channel-subscription-types";
import { AdminActionMessage, AdminSubmitButton } from "./admin-form-controls";
import type { TelegramChannelControlState } from "./action-states";
import {
  addTelegramChannelSubscriptionFromAdmin,
  runTelegramChannelScanFromAdmin,
} from "./telegram-channel-actions";
import { TelegramChannelSubscriptionRow } from "./telegram-channel-subscription-row";

const INITIAL_STATE: TelegramChannelControlState = {
  status: "idle",
  message: "",
};

type TelegramChannelSubscriptionsPanelProps = {
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
  subscriptions: TelegramChannelSubscription[];
};

export function TelegramChannelSubscriptionsPanel({
  currentPage,
  currentStatus,
  scope,
  secret,
  subscriptions,
}: TelegramChannelSubscriptionsPanelProps) {
  const router = useRouter();
  const [addState, addFormAction] = useActionState(
    addTelegramChannelSubscriptionFromAdmin,
    INITIAL_STATE,
  );
  const [scanState, scanFormAction] = useActionState(
    runTelegramChannelScanFromAdmin,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (addState.refreshKey || scanState.refreshKey) {
      router.refresh();
    }
  }, [addState.refreshKey, router, scanState.refreshKey]);

  return (
    <section
      className="admin-manual-add-panel admin-telegram-subscription-panel"
      aria-labelledby="telegram-channel-subscriptions"
    >
      <div className="admin-panel-heading-row">
        <div>
          <h2 id="telegram-channel-subscriptions">텔레그램 채널 구독</h2>
          <p>
            공개 채널을 저장해두고 마지막 확인 이후 메시지만 검수 후보로 가져옵니다.
            신규 채널은 첫 수집 때 최대 두 달 전까지 확인하고, 검수 대기
            여부는 후보 승격 기준으로 판정합니다.
          </p>
        </div>
        <form action={scanFormAction}>
          <input name="secret" type="hidden" value={secret} />
          <AdminSubmitButton variant="dark">활성 채널 수집</AdminSubmitButton>
        </form>
      </div>

      <form action={addFormAction} className="admin-manual-add-form">
        <input name="secret" type="hidden" value={secret} />
        <label htmlFor="telegram-channel-input">채널 username 또는 공개 링크</label>
        <div className="admin-manual-add-row">
          <input
            autoComplete="off"
            id="telegram-channel-input"
            name="telegram_channel"
            placeholder="@channel 또는 https://t.me/channel"
            required
            type="text"
          />
          <AdminSubmitButton>구독 추가</AdminSubmitButton>
        </div>
        <AdminActionMessage state={addState} />
      </form>

      <AdminActionMessage state={scanState} />

      {subscriptions.length === 0 ? (
        <p className="admin-muted">아직 구독 중인 텔레그램 채널이 없습니다.</p>
      ) : (
        <div className="admin-telegram-subscription-list">
          {subscriptions.map((subscription) => (
            <TelegramChannelSubscriptionRow
              currentPage={currentPage}
              currentStatus={currentStatus}
              key={subscription.id}
              scanFormAction={scanFormAction}
              scope={scope}
              secret={secret}
              subscription={subscription}
            />
          ))}
        </div>
      )}
    </section>
  );
}
