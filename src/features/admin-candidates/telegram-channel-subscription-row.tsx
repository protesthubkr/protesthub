"use client";

import type {
  CandidateReviewScope,
  CandidateStatusFilter,
} from "@/lib/admin-candidates/types";
import { formatKoreanDateTime } from "@/lib/format";
import type { TelegramChannelSubscription } from "@/lib/telegram/channel-subscription-types";
import { AdminSubmitButton } from "./admin-form-controls";
import { updateTelegramChannelSubscriptionFromAdmin } from "./telegram-channel-actions";

type TelegramSubscriptionRowProps = {
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scanFormAction: (payload: FormData) => void;
  scope: CandidateReviewScope;
  secret: string;
  subscription: TelegramChannelSubscription;
};

export function TelegramChannelSubscriptionRow({
  currentPage,
  currentStatus,
  scanFormAction,
  scope,
  secret,
  subscription,
}: TelegramSubscriptionRowProps) {
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
          <AdminSubmitButton disabled={subscription.status !== "active"}>
            이 채널 수집
          </AdminSubmitButton>
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

function formatSubscriptionMeta(subscription: TelegramChannelSubscription) {
  const checkedAt = subscription.lastCheckedAt
    ? formatKoreanDateTime(subscription.lastCheckedAt)
    : "아직 수집 전";
  const messageId = subscription.lastCheckedMessageId
    ? `마지막 메시지 ${subscription.lastCheckedMessageId}`
    : "메시지 커서 없음";

  return `${checkedAt} · ${messageId}`;
}
