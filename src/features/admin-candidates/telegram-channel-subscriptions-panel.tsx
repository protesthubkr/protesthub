"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type {
  CandidateReviewScope,
  CandidateStatusFilter,
} from "@/lib/admin-candidates";
import { formatKoreanDateTime } from "@/lib/format";
import type { TelegramChannelSubscription } from "@/lib/telegram/channel-subscriptions";
import {
  addTelegramChannelSubscriptionFromAdmin,
  runTelegramChannelScanFromAdmin,
  updateTelegramChannelSubscriptionFromAdmin,
  type TelegramChannelControlState,
} from "./actions";

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
    if (addState.status === "success" || scanState.status === "success") {
      router.refresh();
    }
  }, [addState.status, router, scanState.status]);

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
          <PanelSubmitButton variant="dark">활성 채널 수집</PanelSubmitButton>
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
          <PanelSubmitButton>구독 추가</PanelSubmitButton>
        </div>
        <PanelMessage state={addState} />
      </form>

      <PanelMessage state={scanState} />

      {subscriptions.length === 0 ? (
        <p className="admin-muted">아직 구독 중인 텔레그램 채널이 없습니다.</p>
      ) : (
        <div className="admin-telegram-subscription-list">
          {subscriptions.map((subscription) => (
            <TelegramSubscriptionRow
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

function TelegramSubscriptionRow({
  currentPage,
  currentStatus,
  scanFormAction,
  scope,
  secret,
  subscription,
}: {
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scanFormAction: (payload: FormData) => void;
  scope: CandidateReviewScope;
  secret: string;
  subscription: TelegramChannelSubscription;
}) {
  return (
    <article className="admin-telegram-subscription-row">
      <div>
        <div className="admin-telegram-subscription-title">
          <strong>{subscription.channelTitle}</strong>
          <span
            className={
              subscription.status === "active"
                ? "admin-subscription-status is-active"
                : "admin-subscription-status"
            }
          >
            {subscription.status === "active" ? "구독 중" : "일시중지"}
          </span>
        </div>
        <a href={subscription.sourceUrl} rel="noreferrer" target="_blank">
          @{subscription.channelUsername}
        </a>
        <p>{formatSubscriptionMeta(subscription)}</p>
        {subscription.lastScanError ? (
          <p className="admin-subscription-error">
            최근 오류: {subscription.lastScanError}
          </p>
        ) : null}
      </div>

      <div className="admin-telegram-subscription-actions">
        <form action={scanFormAction}>
          <input name="secret" type="hidden" value={secret} />
          <input name="subscription_id" type="hidden" value={subscription.id} />
          <PanelSubmitButton disabled={subscription.status !== "active"}>
            이 채널 수집
          </PanelSubmitButton>
        </form>
        <form action={updateTelegramChannelSubscriptionFromAdmin}>
          <ReturnFields
            currentPage={currentPage}
            currentStatus={currentStatus}
            scope={scope}
            secret={secret}
            subscriptionId={subscription.id}
          />
          <input
            name="subscription_action"
            type="hidden"
            value={subscription.status === "active" ? "pause" : "resume"}
          />
          <button type="submit">
            {subscription.status === "active" ? "일시중지" : "재개"}
          </button>
        </form>
        <form action={updateTelegramChannelSubscriptionFromAdmin}>
          <ReturnFields
            currentPage={currentPage}
            currentStatus={currentStatus}
            scope={scope}
            secret={secret}
            subscriptionId={subscription.id}
          />
          <input name="subscription_action" type="hidden" value="delete" />
          <button type="submit">삭제</button>
        </form>
      </div>
    </article>
  );
}

function ReturnFields({
  currentPage,
  currentStatus,
  scope,
  secret,
  subscriptionId,
}: {
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
  subscriptionId: string;
}) {
  return (
    <>
      <input name="secret" type="hidden" value={secret} />
      <input name="subscription_id" type="hidden" value={subscriptionId} />
      <input name="return_page" type="hidden" value={currentPage} />
      <input name="return_status" type="hidden" value={currentStatus} />
      <input name="return_scope" type="hidden" value={scope} />
    </>
  );
}

function PanelSubmitButton({
  children,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  variant?: "dark" | "primary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={variant === "dark" ? "admin-button-dark" : undefined}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "실행 중" : children}
    </button>
  );
}

function PanelMessage({ state }: { state: TelegramChannelControlState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className={
        state.status === "error"
          ? "admin-manual-add-message is-error"
          : "admin-manual-add-message"
      }
    >
      {state.message}
    </p>
  );
}

function formatSubscriptionMeta(subscription: TelegramChannelSubscription) {
  const checkedAt = subscription.lastCheckedAt
    ? formatKoreanDateTime(subscription.lastCheckedAt)
    : "아직 수집 전";
  const messageId = subscription.lastCheckedMessageId
    ? `마지막 메시지 ${subscription.lastCheckedMessageId}`
    : "메시지 커서 없음";

  return `${checkedAt} · ${messageId}`;
}
