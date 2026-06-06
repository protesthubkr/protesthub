import type {
  CandidateReviewScope,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates";
import { getCandidateDetailHydrationState } from "@/lib/x-ingest/hydration-state";
import { hydrateCandidateDetailFromAdmin } from "./actions";
import { HiddenAdminFields } from "./publish-event-form";

type DetailHydrationActionProps = {
  candidate: ReviewCandidate;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
};

export function DetailHydrationAction({
  candidate,
  currentPage,
  currentStatus,
  scope,
  secret,
}: DetailHydrationActionProps) {
  const hydrationState = getCandidateDetailHydrationState(
    candidate.extractionPayload,
    candidate.mediaKeys,
  );

  if (!hydrationState.needsDetail) {
    return null;
  }

  return (
    <form
      action={hydrateCandidateDetailFromAdmin}
      className="admin-ocr-run-form"
    >
      <HiddenAdminFields
        candidateId={candidate.id}
        currentPage={currentPage}
        currentStatus={currentStatus}
        scope={scope}
        secret={secret}
      />
      <button type="submit">X 상세 수집</button>
      <span>{formatHydrationHint(hydrationState)}</span>
    </form>
  );
}

function formatHydrationHint(
  hydrationState: ReturnType<typeof getCandidateDetailHydrationState>,
) {
  const parts = [
    hydrationState.pendingMediaKeys.length > 0
      ? `첨부 ${hydrationState.pendingMediaKeys.length}개`
      : "",
    hydrationState.pendingQuotedPostIds.length > 0
      ? `인용 ${hydrationState.pendingQuotedPostIds.length}건`
      : "",
  ].filter(Boolean);

  return parts.length > 0
    ? `${parts.join(", ")} 상세는 아직 수집하지 않음`
    : "상세 정보는 아직 수집하지 않음";
}
