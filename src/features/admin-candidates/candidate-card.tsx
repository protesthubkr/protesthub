import type {
  CandidateReviewScope,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates";
import { CandidateCardHeader } from "./candidate-card-header";
import {
  LoadTelegramImagesForm,
  OcrMemoForm,
  RunOcrForm,
  RunStructuredExtractionForm,
  RunTextOnlyExtractionForm,
} from "./candidate-processing-forms";
import { CandidateReasonList } from "./candidate-reason-list";
import { CandidateSourcePreview } from "./candidate-source-preview";
import { DetailHydrationAction } from "./detail-hydration-action";
import { PublishEventForm } from "./publish-event-form";
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
  const canShowPublishForm = Boolean(structuredEvent || candidate.publicEvent);

  return (
    <article className="admin-candidate-card">
      <CandidateCardHeader
        candidate={candidate}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <CandidateSourcePreview candidate={candidate} />
      <CandidateReasonList reasons={candidate.candidateReason} />
      <DetailHydrationAction
        candidate={candidate}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <LoadTelegramImagesForm
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

      {canShowPublishForm ? (
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
