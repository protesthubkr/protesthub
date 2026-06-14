import type {
  CandidateReviewScope,
  CandidateStatusFilter,
} from "@/lib/admin-candidates/types";
import type { TelegramChannelSubscription } from "@/lib/telegram/channel-subscription-types";
import type { TelegramBroadcastPreview } from "@/lib/telegram/event-broadcast-types";
import { ManualTelegramLinkForm } from "./manual-telegram-link-form";
import { ManualXPostForm } from "./manual-x-post-form";
import { TelegramBroadcastPreviewPanel } from "./telegram-broadcast-preview-panel";
import { TelegramChannelSubscriptionsPanel } from "./telegram-channel-subscriptions-panel";
import { XIngestControlPanel } from "./x-ingest-control-panel";

export function AdminControlPanels({
  currentPage,
  currentStatus,
  scope,
  secret,
  subscriptions,
  telegramBroadcastPreview,
}: {
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
  subscriptions: TelegramChannelSubscription[];
  telegramBroadcastPreview: TelegramBroadcastPreview;
}) {
  return (
    <div className="admin-control-panels">
      <XIngestControlPanel secret={secret} />
      <TelegramBroadcastPreviewPanel preview={telegramBroadcastPreview} />
      <TelegramChannelSubscriptionsPanel
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
        subscriptions={subscriptions}
      />
      <ManualXPostForm secret={secret} />
      <ManualTelegramLinkForm secret={secret} />
    </div>
  );
}
