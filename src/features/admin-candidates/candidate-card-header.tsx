import type {
  CandidateReviewScope,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates";
import { CANDIDATE_STATUS_LABELS } from "@/lib/admin-candidates";
import { formatKoreanDateTime } from "@/lib/format";
import { getSourceViewLabel } from "@/lib/review-candidate-source";
import { StatusButtonRow } from "./candidate-status-forms";

type CandidateCardHeaderProps = {
  candidate: ReviewCandidate;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
};

export function CandidateCardHeader({
  candidate,
  currentPage,
  currentStatus,
  scope,
  secret,
}: CandidateCardHeaderProps) {
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
