"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatKoreanDate,
  formatKoreanDateTime,
  formatTime,
} from "@/lib/format";
import type { PublicEvent } from "@/lib/types";
import { IssueBadge } from "./issue-badge";

export function EventDetailClient({ event }: { event: PublicEvent }) {
  const [isPosterOpen, setIsPosterOpen] = useState(false);

  return (
    <main className="detail-shell">
      <DetailTopbar />

      <article className="detail-article">
        <EventDetailHeader event={event} />
        <EventFactList event={event} sourceLabel="출처" />

        <section className="detail-section">
          <h2>상세 설명</h2>
          <p className="detail-description">{event.description}</p>
        </section>

        <section className="detail-section">
          <h2>포스터</h2>
          {event.posterImageUrl ? (
            <button
              aria-label="포스터 확대 보기"
              className="poster-button"
              type="button"
              onClick={() => setIsPosterOpen(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.posterImageUrl} alt={`${event.title} 포스터`} />
            </button>
          ) : null}

          <SourcePostLink href={event.sourcePostUrl} label="트위터에서 보기" />
        </section>

        <p className="last-checked">
          최종 확인 {formatKoreanDateTime(event.lastCheckedAt)}
        </p>
      </article>

      {isPosterOpen && event.posterImageUrl ? (
        <PosterZoomModal
          imageUrl={event.posterImageUrl}
          title={event.title}
          onClose={() => setIsPosterOpen(false)}
        />
      ) : null}
    </main>
  );
}

export function CanceledEventPage({ event }: { event: PublicEvent }) {
  return (
    <main className="detail-shell">
      <DetailTopbar />

      <article className="canceled-page">
        <section className="canceled-notice">
          <h1>이 집회는 취소되었어요</h1>
          <p>취소 공지가 확인되어 공개 목록에서는 숨겨졌어요.</p>
        </section>

        <EventDetailHeader event={event} extraClassName="canceled-detail-header" />
        <EventFactList event={event} sourceLabel="취소 출처" />

        <SourcePostLink
          href={event.cancelSourceUrl ?? event.sourcePostUrl}
          label="취소 출처 트위터에서 보기"
        />
      </article>
    </main>
  );
}

function DetailTopbar() {
  return (
    <div className="detail-topbar">
      <Link className="back-link" href="/" aria-label="목록으로 돌아가기">
        <span aria-hidden="true">‹</span>
      </Link>
    </div>
  );
}

function EventDetailHeader({
  event,
  extraClassName,
}: {
  event: PublicEvent;
  extraClassName?: string;
}) {
  return (
    <header
      className={`detail-header ${extraClassName ? extraClassName : ""}`.trim()}
    >
      <h1>{event.title}</h1>
      <div className="issue-badge-list">
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
        <dd>
          <strong>{event.venue}</strong>
        </dd>
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
      className="twitter-source-button"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}

function PosterZoomModal({
  imageUrl,
  title,
  onClose,
}: {
  imageUrl: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="poster-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label="포스터 확대 보기"
        aria-modal="true"
        className="poster-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="poster-modal-close" type="button" onClick={onClose}>
          닫기
        </button>
        <div className="poster-zoom-scroll">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${title} 포스터 확대 이미지`} />
        </div>
      </div>
    </div>
  );
}
