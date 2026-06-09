import {
  CANDIDATE_REVIEW_SCOPE_LABELS,
  CANDIDATE_REVIEW_SCOPES,
  CANDIDATE_STATUS_FILTERS,
  CANDIDATE_STATUS_LABELS,
  type CandidateReviewScope,
  type CandidateStatusFilter,
} from "@/lib/admin-candidates";
import { getAdminCandidatesHref } from "./navigation";

export function CandidateStatusTabs({
  counts,
  scope,
  secret,
  status,
}: {
  counts: Record<CandidateStatusFilter, number>;
  scope: CandidateReviewScope;
  secret: string;
  status: CandidateStatusFilter;
}) {
  return (
    <nav className="admin-status-tabs" aria-label="후보 상태 필터">
      {CANDIDATE_STATUS_FILTERS.map((item) => (
        <a
          aria-current={item === status ? "page" : undefined}
          className={item === status ? "is-active" : ""}
          href={getAdminCandidatesHref({ secret, status: item, scope })}
          key={item}
        >
          <span>{CANDIDATE_STATUS_LABELS[item]}</span>
          <strong>{counts[item]}</strong>
        </a>
      ))}
    </nav>
  );
}

export function CandidateScopeTabs({
  scope,
  secret,
  status,
}: {
  scope: CandidateReviewScope;
  secret: string;
  status: CandidateStatusFilter;
}) {
  return (
    <nav className="admin-scope-tabs" aria-label="검수 범위">
      {CANDIDATE_REVIEW_SCOPES.map((item) => (
        <a
          aria-current={item === scope ? "page" : undefined}
          className={item === scope ? "is-active" : ""}
          href={getAdminCandidatesHref({ secret, status, scope: item })}
          key={item}
        >
          {CANDIDATE_REVIEW_SCOPE_LABELS[item]}
        </a>
      ))}
    </nav>
  );
}
