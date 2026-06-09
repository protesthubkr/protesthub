import type { ReviewCandidate } from "@/lib/admin-candidates";

export function CandidateSourcePreview({
  candidate,
}: {
  candidate: ReviewCandidate;
}) {
  return (
    <div className="admin-candidate-grid">
      <section className="admin-candidate-section">
        <h3>본문</h3>
        <p className="admin-post-text">
          {candidate.textSnapshot || "본문 없음"}
        </p>
      </section>

      <section className="admin-candidate-section">
        <h3>이미지</h3>
        {candidate.media.length > 0 ? (
          <div className="admin-media-grid">
            {candidate.media.map((media) => (
              <a
                href={media.url ?? media.previewImageUrl ?? candidate.sourceUrl}
                key={media.mediaKey}
                rel="noreferrer"
                target="_blank"
              >
                {media.url || media.previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={media.altText ?? `${candidate.sourceName} 이미지`}
                    src={media.url ?? media.previewImageUrl ?? ""}
                  />
                ) : (
                  <span>{media.mediaType}</span>
                )}
              </a>
            ))}
          </div>
        ) : (
          <p className="admin-muted">
            {candidate.mediaKeys.length > 0
              ? `상세 수집 대기 중인 첨부 ${candidate.mediaKeys.length}개`
              : "첨부 이미지 없음"}
          </p>
        )}
      </section>
    </div>
  );
}
