import { getStringParam, isAdminSecretValid } from "@/lib/admin-auth";
import {
  CANDIDATE_REVIEW_SCOPE_LABELS,
  CANDIDATE_REVIEW_SCOPES,
  CANDIDATE_STATUS_FILTERS,
  CANDIDATE_STATUS_LABELS,
  type CandidateReviewScope,
  type CandidateStatusFilter,
  getReviewCandidates,
  parseCandidatePageParam,
  parseCandidateReviewScope,
  parseCandidateStatusFilter,
} from "@/lib/admin-candidates";
import { CandidateCard } from "./candidate-card";
import { AdminCandidatesLoadMore } from "./load-more-trigger";
import { ManualXPostForm } from "./manual-x-post-form";
import { getAdminCandidatesHref } from "./navigation";
import { XIngestControlPanel } from "./x-ingest-control-panel";

type AdminCandidatesPageProps = {
  searchParams: Promise<{
    secret?: string | string[];
    scope?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
};

export async function AdminCandidatesPage({
  searchParams,
}: AdminCandidatesPageProps) {
  const params = await searchParams;
  const secret = getStringParam(params.secret);
  const status = parseCandidateStatusFilter(getStringParam(params.status));
  const scope = parseCandidateReviewScope(getStringParam(params.scope));
  const page = parseCandidatePageParam(getStringParam(params.page));

  if (!secret || !isAdminSecretValid(secret)) {
    return <AdminUnauthorized />;
  }

  const { candidates, counts, error, hasMoreCandidates } =
    await getReviewCandidates(status, scope, page);
  const isOcrConfigured = Boolean(process.env.OPENAI_API_KEY);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">X 수집 후보</p>
          <h1>내부 검수</h1>
        </div>
        <p>
          원본 포스트와 이미지를 확인한 뒤 후보 상태를 정리합니다. 공개 이벤트
          승격은 다음 단계에서 별도 폼으로 처리합니다.
        </p>
      </header>

      <div className="admin-control-panels">
        <XIngestControlPanel secret={secret} />
        <ManualXPostForm secret={secret} />
      </div>

      <CandidateStatusTabs
        counts={counts}
        scope={scope}
        secret={secret}
        status={status}
      />
      <CandidateScopeTabs scope={scope} secret={secret} status={status} />

      {error ? <div className="admin-error">{error}</div> : null}

      {candidates.length === 0 ? (
        <section className="admin-empty">
          <h2>검수할 후보가 없습니다</h2>
          <p>다른 상태 탭을 보거나 X 수집을 먼저 실행하세요.</p>
        </section>
      ) : (
        <section className="admin-candidate-list" aria-label="검수 후보 목록">
          {candidates.map((candidate) => (
            <CandidateCard
              candidate={candidate}
              currentPage={page}
              currentStatus={status}
              isOcrConfigured={isOcrConfigured}
              key={candidate.id}
              scope={scope}
              secret={secret}
            />
          ))}
          <AdminCandidatesLoadMore
            hasMoreCandidates={hasMoreCandidates}
            loadedCount={candidates.length}
            nextHref={
              hasMoreCandidates
                ? getAdminCandidatesHref({
                    page: page + 1,
                    scope,
                    secret,
                    status,
                  })
                : null
            }
          />
        </section>
      )}
    </main>
  );
}

function AdminUnauthorized() {
  return (
    <main className="admin-shell">
      <section className="admin-empty">
        <p className="admin-kicker">관리자 접근 필요</p>
        <h1>검수 화면을 열 수 없습니다</h1>
        <p>
          URL에 `?secret=INGEST_SECRET`을 붙여 접근하세요. 로컬 MVP용 보호
          방식이며, 배포 전에는 별도 관리자 인증으로 바꾸는 것을 전제로 합니다.
        </p>
      </section>
    </main>
  );
}

function CandidateStatusTabs({
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

function CandidateScopeTabs({
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
