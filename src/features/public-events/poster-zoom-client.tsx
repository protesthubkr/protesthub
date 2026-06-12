"use client";

import { useState } from "react";

type PosterZoomClientProps = {
  imageUrl: string;
  sourcePostUrl: string;
  title: string;
};

export function PosterZoomClient({
  imageUrl,
  sourcePostUrl,
  title,
}: PosterZoomClientProps) {
  const [isPosterOpen, setIsPosterOpen] = useState(false);

  return (
    <section className="detail-section">
      <h2>포스터</h2>
      <button
        aria-label="포스터 확대 보기"
        className="poster-button"
        type="button"
        onClick={() => setIsPosterOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`${title} 포스터`}
          decoding="async"
          fetchPriority="low"
          loading="lazy"
        />
      </button>
      <a
        aria-label="원본 보기 새 창 열기"
        className="source-link-button"
        href={sourcePostUrl}
        rel="noreferrer"
        target="_blank"
      >
        원본 보기
      </a>

      {isPosterOpen ? (
        <PosterZoomModal
          imageUrl={imageUrl}
          title={title}
          onClose={() => setIsPosterOpen(false)}
        />
      ) : null}
    </section>
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
          <img
            src={imageUrl}
            alt={`${title} 포스터 확대 이미지`}
            decoding="async"
          />
        </div>
      </div>
    </div>
  );
}
