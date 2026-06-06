import type {
  CandidateReviewScope,
  CandidateStatus,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates";
import { CANDIDATE_STATUS_LABELS } from "@/lib/admin-candidates";
import { formatKoreanDateTime } from "@/lib/format";
import { DetailHydrationAction } from "./detail-hydration-action";
import { formatCandidateReason } from "./reason-labels";
import {
  formatConfidence,
  formatStructuredDates,
  formatStructuredInputMode,
  formatTags,
  getCandidateStructuredEvent,
  getCandidateStructuredInputMode,
} from "./structured-event-view";
import {
  hasMeaningfulExtractionText,
  hasMeaningfulPostText,
} from "./text-quality";
import { PublishEventForm, HiddenAdminFields } from "./publish-event-form";
import {
  runCandidateOcr,
  runCandidateStructuredExtraction,
  runCandidateTextOnlyStructuredExtraction,
  updateCandidateOcrText,
  updateCandidateStatus,
} from "./actions";

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
          inputModeLabel={formatStructuredInputMode(structuredInputMode)}
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
        <h2>{candidate.sourceAccountName}</h2>
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
          href={candidate.sourcePostUrl}
          rel="noreferrer"
          target="_blank"
        >
          X에서 보기
        </a>
      </div>
    </header>
  );
}

function CandidateSourceGrid({ candidate }: { candidate: ReviewCandidate }) {
  return (
    <div className="admin-candidate-grid">
      <section className="admin-candidate-section">
        <h3>원문</h3>
        <p className="admin-post-text">{candidate.textSnapshot || "본문 없음"}</p>
      </section>

      <section className="admin-candidate-section">
        <h3>이미지</h3>
        {candidate.media.length > 0 ? (
          <div className="admin-media-grid">
            {candidate.media.map((media) => (
              <a
                href={media.url ?? media.previewImageUrl ?? candidate.sourcePostUrl}
                key={media.mediaKey}
                rel="noreferrer"
                target="_blank"
              >
                {media.url || media.previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={media.altText ?? `${candidate.sourceAccountName} 이미지`}
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
              ? `상세 수집 전 첨부 ${candidate.mediaKeys.length}개`
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

function StructuredEventSummary({
  inputModeLabel,
  structuredEvent,
}: {
  inputModeLabel: string;
  structuredEvent: NonNullable<
    ReturnType<typeof getCandidateStructuredEvent>
  >;
}) {
  return (
    <section className="admin-structured-event">
      <div className="admin-structured-event-header">
        <h3>{structuredEvent.title || "제목 추출 안 됨"}</h3>
        <span>
          {formatConfidence(structuredEvent.confidence)} · {inputModeLabel}
        </span>
      </div>
      <dl>
        <div>
          <dt>일정</dt>
          <dd>{formatStructuredDates(structuredEvent.dates)}</dd>
        </div>
        <div>
          <dt>장소</dt>
          <dd>
            {[structuredEvent.venue, structuredEvent.address]
              .filter(Boolean)
              .join(" · ") || "미확인"}
          </dd>
        </div>
        <div>
          <dt>의제</dt>
          <dd>{formatTags(structuredEvent.issue_tags)}</dd>
        </div>
        <div>
          <dt>판정</dt>
          <dd>
            {structuredEvent.is_event ? "집회 후보" : "비대상"} ·{" "}
            {structuredEvent.status_hint || "미확인"}
          </dd>
        </div>
      </dl>
      {structuredEvent.exclusion_reason ? (
        <p>{structuredEvent.exclusion_reason}</p>
      ) : null}
    </section>
  );
}

function OcrMemoForm({
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
    <form action={updateCandidateOcrText} className="admin-ocr-form">
      <HiddenAdminFields
        candidateId={candidate.id}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <label htmlFor={`ocr-${candidate.id}`}>OCR/검수 메모</label>
      <textarea
        defaultValue={candidate.ocrText}
        id={`ocr-${candidate.id}`}
        name="ocr_text"
        placeholder="OCR 결과나 검수 중 확인한 텍스트를 임시로 남깁니다."
        rows={4}
      />
      <button type="submit">메모 저장</button>
    </form>
  );
}

function RunOcrForm({
  candidate,
  currentPage,
  currentStatus,
  isOcrConfigured,
  scope,
  secret,
}: {
  candidate: ReviewCandidate;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  isOcrConfigured: boolean;
  scope: CandidateReviewScope;
  secret: string;
}) {
  return (
    <form action={runCandidateOcr} className="admin-ocr-run-form">
      <HiddenAdminFields
        candidateId={candidate.id}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <button
        disabled={!isOcrConfigured || candidate.media.length === 0}
        type="submit"
      >
        OCR 실행
      </button>
      <span>{getOcrActionHint(candidate, isOcrConfigured)}</span>
    </form>
  );
}

function RunTextOnlyExtractionForm({
  canRun,
  candidateId,
  currentPage,
  currentStatus,
  isOcrConfigured,
  scope,
  secret,
}: {
  canRun: boolean;
  candidateId: string;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  isOcrConfigured: boolean;
  scope: CandidateReviewScope;
  secret: string;
}) {
  return (
    <form
      action={runCandidateTextOnlyStructuredExtraction}
      className="admin-ocr-run-form"
    >
      <HiddenAdminFields
        candidateId={candidateId}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <button disabled={!canRun} type="submit">
        본문만 구조화
      </button>
      <span>
        {!isOcrConfigured
          ? "OPENAI_API_KEY 설정 필요"
          : canRun
            ? "X 본문만 사용"
            : "본문 부족"}
      </span>
    </form>
  );
}

function RunStructuredExtractionForm({
  canRun,
  candidateId,
  currentPage,
  currentStatus,
  hasStructuredEvent,
  isOcrConfigured,
  scope,
  secret,
}: {
  canRun: boolean;
  candidateId: string;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  hasStructuredEvent: boolean;
  isOcrConfigured: boolean;
  scope: CandidateReviewScope;
  secret: string;
}) {
  return (
    <form action={runCandidateStructuredExtraction} className="admin-ocr-run-form">
      <HiddenAdminFields
        candidateId={candidateId}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <button disabled={!canRun} type="submit">
        구조화 추출
      </button>
      <span>
        {!isOcrConfigured
          ? "OPENAI_API_KEY 설정 필요"
          : canRun
            ? hasStructuredEvent
              ? "추출 결과 갱신"
              : "본문/OCR 기반 추출"
            : "이미지 후보는 OCR 먼저 권장"}
      </span>
    </form>
  );
}

function StatusButtonRow({
  candidateId,
  currentPage,
  currentStatus,
  scope,
  secret,
}: {
  candidateId: string;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
}) {
  return (
    <div className="admin-action-row">
      <StatusButton
        candidateId={candidateId}
        currentPage={currentPage}
        currentStatus={currentStatus}
        label="검수 대기"
        scope={scope}
        secret={secret}
        status="needs_review"
      />
      <StatusButton
        candidateId={candidateId}
        currentPage={currentPage}
        currentStatus={currentStatus}
        label="무시"
        scope={scope}
        secret={secret}
        status="ignored"
      />
      <StatusButton
        candidateId={candidateId}
        currentPage={currentPage}
        currentStatus={currentStatus}
        label="중복"
        scope={scope}
        secret={secret}
        status="duplicate"
      />
      <StatusButton
        candidateId={candidateId}
        currentPage={currentPage}
        currentStatus={currentStatus}
        label="취소 후보"
        scope={scope}
        secret={secret}
        status="canceled"
      />
    </div>
  );
}

function StatusButton({
  candidateId,
  currentPage,
  currentStatus,
  label,
  scope,
  secret,
  status,
}: {
  candidateId: string;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  label: string;
  scope: CandidateReviewScope;
  secret: string;
  status: CandidateStatus;
}) {
  return (
    <form action={updateCandidateStatus}>
      <HiddenAdminFields
        candidateId={candidateId}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <input name="status" type="hidden" value={status} />
      <button type="submit">{label}</button>
    </form>
  );
}

function getOcrActionHint(
  candidate: ReviewCandidate,
  isOcrConfigured: boolean,
) {
  if (!isOcrConfigured) {
    return "OPENAI_API_KEY 설정 필요";
  }

  if (candidate.media.length === 0) {
    return candidate.mediaKeys.length > 0
      ? "X 상세 수집 후 OCR 가능"
      : "이미지 없음";
  }

  return candidate.ocrText
    ? "OCR 텍스트 저장됨"
    : `첨부 이미지 ${candidate.media.length}개`;
}
