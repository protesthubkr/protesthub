import type {
  CandidateReviewScope,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates/types";
import {
  getSourceTextOnlyExtractionHint,
  type ReviewCandidateSourceType,
} from "@/lib/review-candidate-source";
import { HiddenAdminFields } from "./admin-hidden-fields";
import {
  loadTelegramCandidateImagesFromAdmin,
  runCandidateOcr,
  runCandidateStructuredExtraction,
  runCandidateTextOnlyStructuredExtraction,
  updateCandidateOcrText,
} from "./candidate-processing-actions";

type ActionContext = {
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
};

type CandidateActionProps = ActionContext & {
  candidate: ReviewCandidate;
};

export function OcrMemoForm({
  candidate,
  currentPage,
  currentStatus,
  scope,
  secret,
}: CandidateActionProps) {
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
        placeholder="OCR 결과나 검수 중 확인한 텍스트를 임시로 저장합니다."
        rows={4}
      />
      <button type="submit">메모 저장</button>
    </form>
  );
}

export function RunOcrForm({
  candidate,
  currentPage,
  currentStatus,
  isOcrConfigured,
  scope,
  secret,
}: CandidateActionProps & {
  isOcrConfigured: boolean;
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

export function LoadTelegramImagesForm({
  candidate,
  currentPage,
  currentStatus,
  scope,
  secret,
}: CandidateActionProps) {
  if (candidate.sourceType !== "telegram") {
    return null;
  }

  return (
    <form
      action={loadTelegramCandidateImagesFromAdmin}
      className="admin-ocr-run-form"
    >
      <HiddenAdminFields
        candidateId={candidate.id}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <button type="submit">텔레그램 이미지 불러오기</button>
      <span>
        {candidate.media.length > 0
          ? "원본 메시지에서 이미지 URL 갱신"
          : "원본 메시지에서 이미지 URL 탐색"}
      </span>
    </form>
  );
}

export function RunTextOnlyExtractionForm({
  canRun,
  candidateId,
  currentPage,
  currentStatus,
  isOcrConfigured,
  scope,
  secret,
  sourceType,
}: ActionContext & {
  canRun: boolean;
  candidateId: string;
  isOcrConfigured: boolean;
  sourceType: ReviewCandidateSourceType;
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
            ? getSourceTextOnlyExtractionHint(sourceType)
            : "본문 부족"}
      </span>
    </form>
  );
}

export function RunStructuredExtractionForm({
  canRun,
  candidateId,
  currentPage,
  currentStatus,
  hasStructuredEvent,
  isOcrConfigured,
  scope,
  secret,
}: ActionContext & {
  canRun: boolean;
  candidateId: string;
  hasStructuredEvent: boolean;
  isOcrConfigured: boolean;
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
            : "이미지 후보는 OCR을 먼저 권장"}
      </span>
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
      ? "이미지 상세 수집 후 OCR 가능"
      : "이미지 없음";
  }

  return candidate.ocrText
    ? "OCR 텍스트 저장됨"
    : `첨부 이미지 ${candidate.media.length}개`;
}
