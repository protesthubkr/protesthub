import type {
  CandidateReviewScope,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates";
import { CANDIDATE_STATUS_LABELS } from "@/lib/admin-candidates";
import { formatKoreanDateTime } from "@/lib/format";
import { getSourceViewLabel } from "@/lib/review-candidate-source";
import {
  OcrMemoForm,
  RunOcrForm,
  RunStructuredExtractionForm,
  RunTextOnlyExtractionForm,
  StatusButtonRow,
} from "./candidate-action-forms";
import { DetailHydrationAction } from "./detail-hydration-action";
import { PublishEventForm } from "./publish-event-form";
import { formatCandidateReason } from "./reason-labels";
import {
  getCandidateStructuredEvent,
  getCandidateStructuredInputMode,
} from "./structured-event-view";
import { StructuredEventSummary } from "./structured-event-summary";
import {
  hasMeaningfulExtractionText,
  hasMeaningfulPostText,
} from "./text-quality";

type CandidateCardProps = {
  candidate: ReviewCandidate;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  isOcrConfigured: boolean;
  scope: CandidateReviewScope;
  secret: string;
};

export function CandidateCard({
  candidate,
  currentPage,
  currentStatus,
  isOcrConfigured,
  scope,
  secret,
}: CandidateCardProps) {
  const structuredEvent = getCandidateStructuredEvent(
    candidate.extractionPayload,
  );
  const structuredInputMode = getCandidateStructuredInputMode(
    candidate.extractionPayload,
  );
  const canRunTextOnlyExtraction =
    isOcrConfigured && hasMeaningfulPostText(candidate);
  const canRunExtraction =
    isOcrConfigured && hasMeaningfulExtractionText(candidate);

  return (
    <article className="admin-candidate-card">
      <CandidateHeader
        candidate={candidate}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <CandidateSourceGrid candidate={candidate} />
      <CandidateReasonList reasons={candidate.candidateReason} />
      <DetailHydrationAction
        candidate={candidate}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />

      {structuredEvent ? (
        <StructuredEventSummary
          inputMode={structuredInputMode}
          structuredEvent={structuredEvent}
        />
      ) : null}

      {structuredEvent ? (
        <PublishEventForm
          candidate={candidate}
          currentPage={currentPage}
          currentStatus={currentStatus}
          scope={scope}
          secret={secret}
          structuredEvent={structuredEvent}
        />
      ) : null}

      <details className="admin-raw-details">
        <summary>추출 payload</summary>
        <pre>{JSON.stringify(candidate.extractionPayload, null, 2)}</pre>
      </details>

      <OcrMemoForm
        candidate={candidate}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <RunOcrForm
        candidate={candidate}
        currentPage={currentPage}
        currentStatus={currentStatus}
        isOcrConfigured={isOcrConfigured}
        scope={scope}
        secret={secret}
      />
      <RunTextOnlyExtractionForm
        canRun={canRunTextOnlyExtraction}
        currentPage={currentPage}
        currentStatus={currentStatus}
        isOcrConfigured={isOcrConfigured}
        scope={scope}
        secret={secret}
        candidateId={candidate.id}
        sourceType={candidate.sourceType}
      />
      <RunStructuredExtractionForm
        canRun={canRunExtraction}
        currentPage={currentPage}
        currentStatus={currentStatus}
        hasStructuredEvent={Boolean(structuredEvent)}
        isOcrConfigured={isOcrConfigured}
        scope={scope}
        secret={secret}
        candidateId={candidate.id}
      />
    </article>
  );
}

function CandidateHeader({
  candidate,
  currentPage,
  currentStatus,
  scope,
  secret,
}: {
  candidate: ReviewCandidate;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
}) {
  return (
    <header className="admin-candidate-header">
      <div>
        <span className="admin-status-pill">
          {CANDIDATE_STATUS_LABELS[candidate.status]}
        </span>
        <h2>{candidate.sourceName}</h2>
        <p>{formatKoreanDateTime(candidate.createdAt)}</p>
      </div>
      <div className="admin-candidate-header-actions">
        {candidate.status === "published" ? null : (
          <StatusButtonRow
            candidateId={candidate.id}
            currentPage={currentPage}
            currentStatus={currentStatus}
            scope={scope}
            secret={secret}
          />
        )}
        <a
          className="admin-source-link"
          href={candidate.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {getSourceViewLabel(candidate.sourceType)}
        </a>
      </div>
    </header>
  );
}

function CandidateSourceGrid({ candidate }: { candidate: ReviewCandidate }) {
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

function CandidateReasonList({ reasons }: { reasons: string[] }) {
  return (
    <div className="admin-reason-list" aria-label="후보 생성 근거">
      {reasons.length > 0 ? (
        reasons.map((reason) => (
          <span key={reason}>{formatCandidateReason(reason)}</span>
        ))
      ) : (
        <span>근거 없음</span>
      )}
    </div>
  );
}
