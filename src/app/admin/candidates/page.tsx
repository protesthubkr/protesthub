import { getStringParam, isAdminSecretValid } from "@/lib/admin-auth";
import {
  CANDIDATE_REVIEW_SCOPE_LABELS,
  CANDIDATE_REVIEW_SCOPES,
  CANDIDATE_STATUS_FILTERS,
  CANDIDATE_STATUS_LABELS,
  type CandidateReviewScope,
  type CandidateStatus,
  type CandidateStatusFilter,
  type ReviewCandidate,
  getReviewCandidates,
  parseCandidateReviewScope,
  parseCandidateStatusFilter,
} from "@/lib/admin-candidates";
import { formatKoreanDateTime } from "@/lib/format";
import { ISSUE_OPTIONS } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import {
  getStoredStructuredEventInputMode,
  getStoredStructuredEventResult,
  type StructuredEventInputMode,
} from "@/lib/structured-event-storage";
import type { EventDate, IssueKey } from "@/lib/types";
import {
  publishCandidateEvent,
  runCandidateOcr,
  runCandidateStructuredExtraction,
  runCandidateTextOnlyStructuredExtraction,
  updateCandidateOcrText,
  updateCandidateStatus,
} from "./actions";

type AdminCandidatesPageProps = {
  searchParams: Promise<{
    secret?: string | string[];
    scope?: string | string[];
    status?: string | string[];
  }>;
};

type StructuredEventResult = {
  is_event?: boolean;
  confidence?: number;
  title?: string;
  description?: string;
  venue?: string;
  address?: string;
  region?: string;
  organizers?: string[];
  dates?: { date?: string; start_time?: string }[];
  issue_tags?: string[];
  primary_issue?: string;
  format?: string;
  status_hint?: string;
  exclusion_reason?: string;
};

export const dynamic = "force-dynamic";

export default async function AdminCandidatesPage({
  searchParams,
}: AdminCandidatesPageProps) {
  const params = await searchParams;
  const secret = getStringParam(params.secret);
  const status = parseCandidateStatusFilter(getStringParam(params.status));
  const scope = parseCandidateReviewScope(getStringParam(params.scope));

  if (!secret || !isAdminSecretValid(secret)) {
    return <AdminUnauthorized />;
  }

  const { candidates, counts, error } = await getReviewCandidates(
    status,
    scope,
  );
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

      <nav className="admin-status-tabs" aria-label="후보 상태 필터">
        {CANDIDATE_STATUS_FILTERS.map((item) => (
          <a
            aria-current={item === status ? "page" : undefined}
            className={item === status ? "is-active" : ""}
            href={getAdminHref(secret, item, scope)}
            key={item}
          >
            <span>{CANDIDATE_STATUS_LABELS[item]}</span>
            <strong>{counts[item]}</strong>
          </a>
        ))}
      </nav>

      <nav className="admin-scope-tabs" aria-label="검수 범위">
        {CANDIDATE_REVIEW_SCOPES.map((item) => (
          <a
            aria-current={item === scope ? "page" : undefined}
            className={item === scope ? "is-active" : ""}
            href={getAdminHref(secret, status, item)}
            key={item}
          >
            {CANDIDATE_REVIEW_SCOPE_LABELS[item]}
          </a>
        ))}
      </nav>

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
              currentStatus={status}
              isOcrConfigured={isOcrConfigured}
              key={candidate.id}
              scope={scope}
              secret={secret}
            />
          ))}
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

function CandidateCard({
  candidate,
  currentStatus,
  isOcrConfigured,
  scope,
  secret,
}: {
  candidate: ReviewCandidate;
  currentStatus: CandidateStatusFilter;
  isOcrConfigured: boolean;
  scope: CandidateReviewScope;
  secret: string;
}) {
  const structuredEvent = getStructuredEvent(candidate.extractionPayload);
  const structuredInputMode = getStructuredInputMode(candidate.extractionPayload);
  const canRunTextOnlyExtraction =
    isOcrConfigured && hasMeaningfulPostText(candidate);
  const canRunExtraction =
    isOcrConfigured && hasMeaningfulExtractionText(candidate);

  return (
    <article className="admin-candidate-card">
      <header className="admin-candidate-header">
        <div>
          <span className="admin-status-pill">
            {CANDIDATE_STATUS_LABELS[candidate.status]}
          </span>
          <h2>{candidate.sourceAccountName}</h2>
          <p>{formatKoreanDateTime(candidate.createdAt)}</p>
        </div>
        <a
          className="admin-source-link"
          href={candidate.sourcePostUrl}
          rel="noreferrer"
          target="_blank"
        >
          X에서 보기
        </a>
      </header>

      <div className="admin-candidate-grid">
        <section className="admin-candidate-section">
          <h3>원문</h3>
          <p className="admin-post-text">{candidate.textSnapshot || "본문 없음"}</p>
        </section>

        <section className="admin-candidate-section">
          <h3>이미지</h3>
          {candidate.media.length > 0 ? (
            <div className="admin-media-grid">
              {candidate.media.map((media) => (
                <a
                  href={media.url ?? media.previewImageUrl ?? candidate.sourcePostUrl}
                  key={media.mediaKey}
                  rel="noreferrer"
                  target="_blank"
                >
                  {media.url || media.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={media.altText ?? `${candidate.sourceAccountName} 이미지`}
                      src={media.url ?? media.previewImageUrl ?? ""}
                    />
                  ) : (
                    <span>{media.mediaType}</span>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <p className="admin-muted">첨부 이미지 없음</p>
          )}
        </section>
      </div>

      <div className="admin-reason-list" aria-label="후보 생성 근거">
        {candidate.candidateReason.length > 0 ? (
          candidate.candidateReason.map((reason) => (
            <span key={reason}>{formatReason(reason)}</span>
          ))
        ) : (
          <span>근거 없음</span>
        )}
      </div>

      {structuredEvent ? (
        <section className="admin-structured-event">
          <div className="admin-structured-event-header">
            <h3>{structuredEvent.title || "제목 추출 안 됨"}</h3>
            <span>
              {formatConfidence(structuredEvent.confidence)} ·{" "}
              {formatStructuredInputMode(structuredInputMode)}
            </span>
          </div>
          <dl>
            <div>
              <dt>일정</dt>
              <dd>{formatStructuredDates(structuredEvent.dates)}</dd>
            </div>
            <div>
              <dt>장소</dt>
              <dd>
                {[structuredEvent.venue, structuredEvent.address]
                  .filter(Boolean)
                  .join(" · ") || "미확인"}
              </dd>
            </div>
            <div>
              <dt>의제</dt>
              <dd>{formatTags(structuredEvent.issue_tags)}</dd>
            </div>
            <div>
              <dt>판정</dt>
              <dd>
                {structuredEvent.is_event ? "집회 후보" : "비대상"} ·{" "}
                {structuredEvent.status_hint || "미확인"}
              </dd>
            </div>
          </dl>
          {structuredEvent.exclusion_reason ? (
            <p>{structuredEvent.exclusion_reason}</p>
          ) : null}
        </section>
      ) : null}

      {structuredEvent ? (
        <PublishEventForm
          candidate={candidate}
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

      <form action={updateCandidateOcrText} className="admin-ocr-form">
        <input name="secret" type="hidden" value={secret} />
        <input name="candidate_id" type="hidden" value={candidate.id} />
        <input name="return_status" type="hidden" value={currentStatus} />
        <input name="return_scope" type="hidden" value={scope} />
        <label htmlFor={`ocr-${candidate.id}`}>OCR/검수 메모</label>
        <textarea
          defaultValue={candidate.ocrText}
          id={`ocr-${candidate.id}`}
          name="ocr_text"
          placeholder="OCR 결과나 검수 중 확인한 텍스트를 임시로 남깁니다."
          rows={4}
        />
        <button type="submit">메모 저장</button>
      </form>

      <form action={runCandidateOcr} className="admin-ocr-run-form">
        <input name="secret" type="hidden" value={secret} />
        <input name="candidate_id" type="hidden" value={candidate.id} />
        <input name="return_status" type="hidden" value={currentStatus} />
        <input name="return_scope" type="hidden" value={scope} />
        <button
          disabled={!isOcrConfigured || candidate.media.length === 0}
          type="submit"
        >
          OCR 실행
        </button>
        {!isOcrConfigured ? (
          <span>OPENAI_API_KEY 설정 필요</span>
        ) : candidate.media.length === 0 ? (
          <span>이미지 없음</span>
        ) : candidate.ocrText ? (
          <span>OCR 텍스트 저장됨</span>
        ) : (
          <span>첨부 이미지 {candidate.media.length}개</span>
        )}
      </form>

      <form
        action={runCandidateTextOnlyStructuredExtraction}
        className="admin-ocr-run-form"
      >
        <input name="secret" type="hidden" value={secret} />
        <input name="candidate_id" type="hidden" value={candidate.id} />
        <input name="return_status" type="hidden" value={currentStatus} />
        <input name="return_scope" type="hidden" value={scope} />
        <button disabled={!canRunTextOnlyExtraction} type="submit">
          본문만 구조화
        </button>
        {!isOcrConfigured ? (
          <span>OPENAI_API_KEY 설정 필요</span>
        ) : canRunTextOnlyExtraction ? (
          <span>X 본문만 사용</span>
        ) : (
          <span>본문 부족</span>
        )}
      </form>

      <form
        action={runCandidateStructuredExtraction}
        className="admin-ocr-run-form"
      >
        <input name="secret" type="hidden" value={secret} />
        <input name="candidate_id" type="hidden" value={candidate.id} />
        <input name="return_status" type="hidden" value={currentStatus} />
        <input name="return_scope" type="hidden" value={scope} />
        <button disabled={!canRunExtraction} type="submit">
          구조화 추출
        </button>
        {!isOcrConfigured ? (
          <span>OPENAI_API_KEY 설정 필요</span>
        ) : canRunExtraction ? (
          <span>{structuredEvent ? "추출 결과 갱신" : "본문/OCR 기반 추출"}</span>
        ) : (
          <span>이미지 후보는 OCR 먼저 권장</span>
        )}
      </form>

      <div className="admin-action-row">
        <StatusButton
          candidateId={candidate.id}
          currentStatus={currentStatus}
          label="검수 대기"
          scope={scope}
          secret={secret}
          status="needs_review"
        />
        <StatusButton
          candidateId={candidate.id}
          currentStatus={currentStatus}
          label="무시"
          scope={scope}
          secret={secret}
          status="ignored"
        />
        <StatusButton
          candidateId={candidate.id}
          currentStatus={currentStatus}
          label="중복"
          scope={scope}
          secret={secret}
          status="duplicate"
        />
        <StatusButton
          candidateId={candidate.id}
          currentStatus={currentStatus}
          label="취소 후보"
          scope={scope}
          secret={secret}
          status="canceled"
        />
      </div>
    </article>
  );
}

function PublishEventForm({
  candidate,
  currentStatus,
  scope,
  secret,
  structuredEvent,
}: {
  candidate: ReviewCandidate;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
  structuredEvent: StructuredEventResult;
}) {
  const issueKeys = candidate.publicEvent
    ? candidate.publicEvent.issueTags
    : getPublishIssueKeys(structuredEvent);
  const primaryIssue = candidate.publicEvent
    ? candidate.publicEvent.primaryIssue
    : getPublishPrimaryIssue(structuredEvent, issueKeys);
  const dateRows = candidate.publicEvent
    ? getPublishPublicDateRows(candidate.publicEvent.dates)
    : getPublishDateRows(structuredEvent);
  const posterImageUrl =
    candidate.publicEvent?.posterImageUrl ?? getPosterImageUrl(candidate);

  return (
    <details className="admin-publish-panel">
      <summary>
        {candidate.status === "published" ? "공개 수정" : "공개하기"}
      </summary>
      <form action={publishCandidateEvent} className="admin-publish-form">
        <input name="secret" type="hidden" value={secret} />
        <input name="candidate_id" type="hidden" value={candidate.id} />
        <input name="return_status" type="hidden" value={currentStatus} />
        <input name="return_scope" type="hidden" value={scope} />

        <div className="admin-publish-grid">
          <label>
            제목
            <input
              defaultValue={
                candidate.publicEvent?.title ?? structuredEvent.title ?? ""
              }
              name="title"
              required
              type="text"
            />
          </label>
          <label>
            지역
            <select
              defaultValue={
                REGION_OPTIONS.includes(candidate.publicEvent?.region ?? "")
                  ? candidate.publicEvent?.region
                  : REGION_OPTIONS.includes(structuredEvent.region ?? "")
                    ? structuredEvent.region
                  : ""
              }
              name="region"
              required
            >
              <option value="">선택</option>
              {REGION_OPTIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          설명
          <textarea
            defaultValue={
              candidate.publicEvent?.description ??
              structuredEvent.description ??
              ""
            }
            name="description"
            rows={3}
          />
        </label>

        <fieldset>
          <legend>일정</legend>
          {dateRows.map((date, index) => (
            <div className="admin-publish-date-row" key={`${date.date}-${index}`}>
              <input
                aria-label={`날짜 ${index + 1}`}
                defaultValue={date.date}
                name="event_date"
                required={index === 0}
                type="date"
              />
              <input
                aria-label={`시작 시간 ${index + 1}`}
                defaultValue={normalizeTimeInput(date.start_time)}
                name="start_time"
                type="time"
              />
            </div>
          ))}
        </fieldset>

        <div className="admin-publish-grid">
          <label>
            장소
            <input
              defaultValue={
                candidate.publicEvent?.venue ?? structuredEvent.venue ?? ""
              }
              name="venue"
              required
              type="text"
            />
          </label>
          <label>
            상세장소
            <input
              defaultValue={
                candidate.publicEvent?.address ?? structuredEvent.address ?? ""
              }
              name="address"
              type="text"
            />
          </label>
        </div>

        <fieldset>
          <legend>의제 태그</legend>
          <div className="admin-checkbox-list">
            {ISSUE_OPTIONS.map((issue) => (
              <label key={issue.key}>
                <input
                  defaultChecked={issueKeys.includes(issue.key)}
                  name="issue_tags"
                  type="checkbox"
                  value={issue.key}
                />
                {issue.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="admin-publish-grid">
          <label>
            대표 태그
            <select defaultValue={primaryIssue} name="primary_issue" required>
              <option value="">선택</option>
              {ISSUE_OPTIONS.map((issue) => (
                <option key={issue.key} value={issue.key}>
                  {issue.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            포스터 URL
            <input
              defaultValue={posterImageUrl}
              name="poster_image_url"
              type="url"
            />
          </label>
        </div>

        <button type="submit">공개 적용</button>
      </form>
    </details>
  );
}

function StatusButton({
  candidateId,
  currentStatus,
  label,
  scope,
  secret,
  status,
}: {
  candidateId: string;
  currentStatus: CandidateStatusFilter;
  label: string;
  scope: CandidateReviewScope;
  secret: string;
  status: CandidateStatus;
}) {
  return (
    <form action={updateCandidateStatus}>
      <input name="secret" type="hidden" value={secret} />
      <input name="candidate_id" type="hidden" value={candidateId} />
      <input name="status" type="hidden" value={status} />
      <input name="return_status" type="hidden" value={currentStatus} />
      <input name="return_scope" type="hidden" value={scope} />
      <button type="submit">{label}</button>
    </form>
  );
}

function getAdminHref(
  secret: string,
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
) {
  const params = new URLSearchParams({ secret, status, scope });
  return `/admin/candidates?${params.toString()}`;
}

function formatReason(reason: string) {
  if (reason === "heuristic:v2") {
    return "후보 기준 v2";
  }

  if (reason === "review_keywords:일시+장소") {
    return "검수 키워드 일시+장소";
  }

  if (reason === "missing_review_keywords:일시+장소") {
    return "검수 키워드 부족";
  }

  if (reason.startsWith("keyword:")) {
    return `키워드 ${reason.replace("keyword:", "")}`;
  }

  if (reason.startsWith("strong_keyword:")) {
    return `강한 신호 ${reason.replace("strong_keyword:", "")}`;
  }

  if (reason.startsWith("weak_keyword:")) {
    return `보조 신호 ${reason.replace("weak_keyword:", "")}`;
  }

  if (reason.startsWith("notice_hint:")) {
    return `공지성 신호 ${reason.replace("notice_hint:", "")}`;
  }

  if (reason.startsWith("ocr_keyword:")) {
    return `OCR 키워드 ${reason.replace("ocr_keyword:", "")}`;
  }

  if (reason === "has_photo_media") {
    return "이미지 포함";
  }

  if (reason === "has_date_hint") {
    return "날짜 신호";
  }

  if (reason === "has_place_hint") {
    return "장소 신호";
  }

  if (reason === "has_quote_post") {
    return "인용 포스트";
  }

  if (reason === "low_confidence_image_only") {
    return "이미지 단독 확인";
  }

  if (reason === "ocr_text_present") {
    return "OCR 텍스트 있음";
  }

  if (reason === "ocr_text_empty") {
    return "OCR 텍스트 없음";
  }

  if (reason === "ocr_has_date_hint") {
    return "OCR 날짜 신호";
  }

  if (reason === "ocr_has_place_hint") {
    return "OCR 장소 신호";
  }

  if (reason === "ocr_event_signal") {
    return "OCR 집회 신호";
  }

  if (reason === "past_event_date") {
    return "오늘 이전 일정 제외";
  }

  if (reason === "llm_structured_extracted") {
    return "구조화 추출됨";
  }

  if (reason === "published_event") {
    return "공개 이벤트 저장";
  }

  if (reason === "llm_input:post_text_only") {
    return "LLM 입력 본문만";
  }

  if (reason === "llm_input:post_text_and_ocr") {
    return "LLM 입력 본문+OCR";
  }

  if (reason === "llm_event_candidate") {
    return "LLM 집회 후보";
  }

  if (reason === "llm_not_event") {
    return "LLM 비대상";
  }

  if (reason.startsWith("llm_status:")) {
    return `LLM 상태 ${reason.replace("llm_status:", "")}`;
  }

  if (reason.startsWith("llm_fallback_from:")) {
    return `LLM 재시도 원 모델 ${reason.replace("llm_fallback_from:", "")}`;
  }

  if (reason.startsWith("llm_fallback_to:")) {
    return `LLM 재시도 모델 ${reason.replace("llm_fallback_to:", "")}`;
  }

  if (reason.startsWith("llm_fallback_reason:")) {
    return `LLM 재시도 사유 ${reason.replace("llm_fallback_reason:", "")}`;
  }

  if (reason === "llm_has_date") {
    return "LLM 날짜 확인";
  }

  if (reason === "llm_has_place") {
    return "LLM 장소 확인";
  }

  if (reason.startsWith("llm_issue:")) {
    return `LLM 의제 ${reason.replace("llm_issue:", "")}`;
  }

  return reason;
}

function getStructuredEvent(
  extractionPayload: Record<string, unknown>,
): StructuredEventResult | null {
  return getStoredStructuredEventResult(extractionPayload);
}

function getStructuredInputMode(
  extractionPayload: Record<string, unknown>,
): StructuredEventInputMode | null {
  return getStoredStructuredEventInputMode(extractionPayload);
}

function hasMeaningfulPostText(candidate: ReviewCandidate) {
  return isMeaningfulExtractionText(candidate.textSnapshot);
}

function hasMeaningfulExtractionText(candidate: ReviewCandidate) {
  return isMeaningfulExtractionText(
    [candidate.textSnapshot, candidate.ocrText].join("\n"),
  );
}

function isMeaningfulExtractionText(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim().length > 12;
}

function formatConfidence(confidence: number | undefined) {
  return typeof confidence === "number" ? `${confidence}%` : "신뢰도 미확인";
}

function formatStructuredDates(
  dates: { date?: string; start_time?: string }[] | undefined,
) {
  if (!dates || dates.length === 0) {
    return "미확인";
  }

  return dates
    .map((date) => [date.date, date.start_time].filter(Boolean).join(" "))
    .join(", ");
}

function formatTags(tags: string[] | undefined) {
  return tags && tags.length > 0 ? tags.join(", ") : "미확인";
}

function formatStructuredInputMode(mode: StructuredEventInputMode | null) {
  if (mode === "post_text_only") {
    return "본문만";
  }

  if (mode === "post_text_and_ocr") {
    return "본문+OCR";
  }

  return "입력 미확인";
}

function getPublishDateRows(structuredEvent: StructuredEventResult) {
  const dates = (structuredEvent.dates ?? [])
    .map((date) => ({
      date: date.date ?? "",
      start_time: date.start_time ?? "",
    }))
    .filter((date) => date.date);

  if (dates.length === 0) {
    return [{ date: "", start_time: "" }];
  }

  return [...dates, { date: "", start_time: "" }];
}

function getPublishPublicDateRows(dates: EventDate[]) {
  if (dates.length === 0) {
    return [{ date: "", start_time: "" }];
  }

  return [
    ...dates.map((date) => ({
      date: date.date,
      start_time: date.startTime ?? "",
    })),
    { date: "", start_time: "" },
  ];
}

function getPublishIssueKeys(structuredEvent: StructuredEventResult) {
  const issueKeys = (structuredEvent.issue_tags ?? [])
    .map(getIssueKey)
    .filter((issue): issue is IssueKey => Boolean(issue));
  const primaryIssue = getIssueKey(structuredEvent.primary_issue);

  if (primaryIssue) {
    issueKeys.unshift(primaryIssue);
  }

  return Array.from(new Set(issueKeys));
}

function getPublishPrimaryIssue(
  structuredEvent: StructuredEventResult,
  issueKeys: IssueKey[],
) {
  return getIssueKey(structuredEvent.primary_issue) ?? issueKeys[0] ?? "";
}

function getIssueKey(value: string | undefined) {
  if (!value) {
    return null;
  }

  return (
    ISSUE_OPTIONS.find((issue) => issue.key === value || issue.label === value)
      ?.key ?? null
  );
}

function normalizeTimeInput(value: string | undefined) {
  return value && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "";
}

function getPosterImageUrl(candidate: ReviewCandidate) {
  const firstImage = candidate.media.find(
    (media) => media.url || media.previewImageUrl,
  );

  return firstImage?.url ?? firstImage?.previewImageUrl ?? "";
}
