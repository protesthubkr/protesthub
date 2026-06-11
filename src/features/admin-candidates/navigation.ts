import type {
  CandidateReviewScope,
  CandidateStatusFilter,
} from "@/lib/admin-candidates/types";

export function getAdminCandidatesHref({
  page,
  scope,
  secret,
  status,
}: {
  page?: number;
  scope: CandidateReviewScope;
  secret: string;
  status: CandidateStatusFilter;
}) {
  const params = new URLSearchParams({ secret, status, scope });

  if (page && page > 1) {
    params.set("page", String(page));
  }

  return `/admin/candidates?${params.toString()}`;
}
