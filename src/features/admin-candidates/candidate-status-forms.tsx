import type {
  CandidateReviewScope,
  CandidateStatus,
  CandidateStatusFilter,
} from "@/lib/admin-candidates/types";
import { HiddenAdminFields } from "./admin-hidden-fields";
import { updateCandidateStatus } from "./candidate-status-actions";

type ActionContext = {
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
};

export function StatusButtonRow({
  candidateId,
  currentPage,
  currentStatus,
  scope,
  secret,
}: ActionContext & {
  candidateId: string;
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
}: ActionContext & {
  candidateId: string;
  label: string;
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
