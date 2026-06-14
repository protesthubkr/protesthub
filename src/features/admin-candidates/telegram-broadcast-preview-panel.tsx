import { formatKoreanDate, formatKoreanDateTime } from "@/lib/format";
import type {
  TelegramBroadcastPreview,
  TelegramBroadcastPreviewItem,
  TelegramBroadcastPreviewState,
} from "@/lib/telegram/event-broadcast-types";

const PREVIEW_STATE_LABELS = {
  changed: "내용 변경됨",
  failed: "실패",
  pending: "대기",
  ready: "발송 예정",
  sent: "발송됨",
} satisfies Record<TelegramBroadcastPreviewState, string>;

export function TelegramBroadcastPreviewPanel({
  preview,
}: {
  preview: TelegramBroadcastPreview;
}) {
  return (
    <section
      aria-labelledby="telegram-broadcast-preview"
      className="admin-manual-add-panel admin-telegram-preview-panel"
    >
      <div>
        <h2 id="telegram-broadcast-preview">텔레그램 브리핑 미리보기</h2>
        <p>
          {formatKoreanDate(preview.targetDate)} 집회 기준으로 생성되는 다음
          브리핑입니다.
        </p>
        <p className="admin-muted">
          생성 시각 {formatKoreanDateTime(preview.generatedAt)}
        </p>
      </div>

      <div className="admin-telegram-preview-list">
        {preview.errorMessage ? (
          <p className="admin-manual-add-message is-error">
            {preview.errorMessage}
          </p>
        ) : null}

        {!preview.errorMessage && preview.items.length === 0 ? (
          <p className="admin-muted">미리보기할 메시지가 없습니다.</p>
        ) : null}

        {preview.items.map((item, index) => (
          <TelegramBroadcastPreviewCard
            item={item}
            key={`${item.title}-${item.occurrenceDate}-${index}`}
          />
        ))}
      </div>
    </section>
  );
}

function TelegramBroadcastPreviewCard({
  item,
}: {
  item: TelegramBroadcastPreviewItem;
}) {
  return (
    <article className="admin-telegram-preview-card">
      <div className="admin-telegram-preview-card-header">
        <div>
          <h3>{item.title}</h3>
          <p>
            {item.method} · {formatKoreanDate(item.occurrenceDate)}
          </p>
        </div>
        <span
          className={`admin-telegram-preview-status is-${item.previewState}`}
        >
          {PREVIEW_STATE_LABELS[item.previewState]}
        </span>
      </div>
      <pre className="admin-telegram-preview-message">{item.message}</pre>
    </article>
  );
}
