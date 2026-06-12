import Link from "next/link";
import {
  formatKoreanDate,
  formatKoreanDateTime,
  formatTime,
} from "@/lib/format";
import type { PublicEvent } from "@/lib/types";
import { IssueBadge } from "./issue-badge";
import { PosterZoomClient } from "./poster-zoom-client";

export function EventDetailPage({ event }: { event: PublicEvent }) {
  return (
    <main className="detail-shell">
      <DetailTopbar event={event} />

      <article className="detail-article">
        <EventFactList event={event} sourceLabel="출처" />

        {event.posterImageUrl ? (
          <PosterZoomClient
            imageUrl={event.posterImageUrl}
            sourcePostUrl={event.sourcePostUrl}
            title={event.title}
          />
        ) : (
          <section className="detail-section detail-source-section">
            <h2>원본 출처</h2>
            <SourcePostLink href={event.sourcePostUrl} label="원본 보기" />
          </section>
        )}

        <p className="last-checked">
          최종 확인 {formatKoreanDateTime(event.lastCheckedAt)}
        </p>
      </article>
    </main>
  );
}

export function CanceledEventPage({ event }: { event: PublicEvent }) {
  return (
    <main className="detail-shell">
      <DetailTopbar event={event} />

      <article className="canceled-page">
        <section className="canceled-notice">
          <h1>이 집회는 취소되었어요</h1>
          <p>취소 공지가 확인되어 공개 목록에서는 숨겨졌어요.</p>
        </section>

        <EventFactList event={event} sourceLabel="취소 출처" />

        <SourcePostLink
          href={event.cancelSourceUrl ?? event.sourcePostUrl}
          label="취소 출처 보기"
        />
      </article>
    </main>
  );
}

function DetailTopbar({ event }: { event: PublicEvent }) {
  return (
    <header className="detail-topbar">
      <div className="detail-title-row">
        <Link className="back-link" href="/" aria-label="목록으로 돌아가기">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1>{event.title}</h1>
      </div>
      <div className="issue-badge-list detail-title-tags">
        {event.issueTags.map((issue) => (
          <IssueBadge key={issue} issue={issue} />
        ))}
      </div>
    </header>
  );
}

function EventFactList({
  event,
  sourceLabel,
}: {
  event: PublicEvent;
  sourceLabel: string;
}) {
  return (
    <dl className="detail-fact-list" aria-label="집회 핵심 정보">
      <div className="detail-fact-row is-primary">
        <dt>일시</dt>
        <dd>
          {event.dates.length > 0
            ? event.dates.map((date) => (
                <span className="detail-date-line" key={date.date}>
                  {formatKoreanDate(date.date)} {formatTime(date.startTime)}
                </span>
              ))
            : "날짜 미정"}
        </dd>
      </div>
      <div className="detail-fact-row">
        <dt>장소</dt>
        <dd>{event.venue}</dd>
      </div>
      {event.address ? (
        <div className="detail-fact-row">
          <dt>상세장소</dt>
          <dd>{event.address}</dd>
        </div>
      ) : null}
      <div className="detail-fact-row">
        <dt>{sourceLabel}</dt>
        <dd>{event.sourceAccountName}</dd>
      </div>
    </dl>
  );
}

function SourcePostLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      aria-label={`${label} 새 창 열기`}
      className="source-link-button"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}
