import type {
  CandidateReviewScope,
  CandidateStatusFilter,
} from "@/lib/admin-candidates";

type HiddenAdminFieldsProps = {
  candidateId: string;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
};

export function HiddenAdminFields({
  candidateId,
  currentPage,
  currentStatus,
  scope,
  secret,
}: HiddenAdminFieldsProps) {
  return (
    <>
      <input name="secret" type="hidden" value={secret} />
      <input name="candidate_id" type="hidden" value={candidateId} />
      <input name="return_page" type="hidden" value={currentPage} />
      <input name="return_status" type="hidden" value={currentStatus} />
      <input name="return_scope" type="hidden" value={scope} />
    </>
  );
}
