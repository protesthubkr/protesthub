import { getStringParam, isAdminSecretValid } from "@/lib/admin-auth";
import { getReviewCandidates } from "@/lib/admin-candidates/repository";
import {
  parseCandidatePageParam,
  parseCandidateReviewScope,
  parseCandidateStatusFilter,
} from "@/lib/admin-candidates/filters";
import { getTelegramChannelSubscriptions } from "@/lib/telegram/channel-subscription-repository";
import { getTomorrowTelegramBroadcastPreview } from "@/lib/telegram/event-broadcast-preview";
import { AdminControlPanels } from "./admin-control-panels";
import { AdminUnauthorized } from "./admin-unauthorized";
import { CandidateCard } from "./candidate-card";
import { CandidateScopeTabs, CandidateStatusTabs } from "./candidate-filter-tabs";
import { AdminCandidatesLoadMore } from "./load-more-trigger";
import { getAdminCandidatesHref } from "./navigation";

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

  const [
    { candidates, counts, error, hasMoreCandidates },
    subscriptions,
    telegramBroadcastPreview,
  ] = await Promise.all([
      getReviewCandidates(status, scope, page),
      getTelegramChannelSubscriptions(),
      getTomorrowTelegramBroadcastPreview(),
    ]);
  const isOcrConfigured = Boolean(process.env.OPENAI_API_KEY);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">수집 후보</p>
          <h1>관리자 검수</h1>
        </div>
        <p>
          원본 링크와 이미지를 확인하고 후보 상태를 정리합니다. 공개 일정 저장은
          구조화 추출 후 별도 폼에서 처리합니다.
        </p>
      </header>

      <AdminControlPanels
        currentPage={page}
        currentStatus={status}
        scope={scope}
        secret={secret}
        subscriptions={subscriptions}
        telegramBroadcastPreview={telegramBroadcastPreview}
      />

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
          <h2>검토할 후보가 없습니다</h2>
          <p>다른 상태 탭을 보거나 수집/수동 추가를 먼저 실행하세요.</p>
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
