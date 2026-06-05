import type {
  CandidateReviewScope,
  CandidateStatusFilter,
} from "@/lib/admin-candidates";

export function getAdminCandidatesHref({
  scope,
  secret,
  status,
}: {
  scope: CandidateReviewScope;
  secret: string;
  status: CandidateStatusFilter;
}) {
  const params = new URLSearchParams({ secret, status, scope });
  return `/admin/candidates?${params.toString()}`;
}
