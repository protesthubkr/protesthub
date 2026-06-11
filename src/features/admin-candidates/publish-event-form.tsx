import type {
  CandidateReviewScope,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates/types";
import { ISSUE_OPTIONS } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import {
  getPublishFormDefaults,
  normalizeTimeInput,
} from "./publish-defaults";
import type { StructuredEventResult } from "./structured-event-view";
import { HiddenAdminFields } from "./admin-hidden-fields";
import { publishCandidateEvent, unpublishCandidateEvent } from "./publication-actions";

type PublishEventFormProps = {
  candidate: ReviewCandidate;
  currentPage: number;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
  structuredEvent: StructuredEventResult | null;
};

export function PublishEventForm({
  candidate,
  currentPage,
  currentStatus,
  scope,
  secret,
  structuredEvent,
}: PublishEventFormProps) {
  const defaults = getPublishFormDefaults(candidate, structuredEvent);

  return (
    <>
      <details className="admin-publish-panel">
      <summary>
        {candidate.status === "published" ? "공개 수정" : "공개하기"}
      </summary>
      <form action={publishCandidateEvent} className="admin-publish-form">
        <HiddenAdminFields
          candidateId={candidate.id}
          currentPage={currentPage}
          currentStatus={currentStatus}
          scope={scope}
          secret={secret}
        />

        <div className="admin-publish-grid">
          <label>
            제목
            <input
              defaultValue={defaults.title}
              name="title"
              required
              type="text"
            />
          </label>
          <label>
            지역
            <select defaultValue={defaults.region} name="region" required>
              <option value="">선택</option>
              {REGION_OPTIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>일정</legend>
          {defaults.dateRows.map((date, index) => (
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
              defaultValue={defaults.venue}
              name="venue"
              required
              type="text"
            />
          </label>
          <label>
            상세장소
            <input defaultValue={defaults.address} name="address" type="text" />
          </label>
        </div>

        <fieldset>
          <legend>의제 태그</legend>
          <div className="admin-checkbox-list">
            {ISSUE_OPTIONS.map((issue) => (
              <label key={issue.key}>
                <input
                  defaultChecked={defaults.issueKeys.includes(issue.key)}
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
            <select
              defaultValue={defaults.primaryIssue}
              name="primary_issue"
              required
            >
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
              defaultValue={defaults.posterImageUrl}
              name="poster_image_url"
              type="url"
            />
          </label>
        </div>

        <button type="submit">공개 적용</button>
      </form>

      </details>

      {candidate.status === "published" ? (
        <form action={unpublishCandidateEvent} className="admin-unpublish-form">
          <HiddenAdminFields
            candidateId={candidate.id}
            currentPage={currentPage}
            currentStatus={currentStatus}
            scope={scope}
            secret={secret}
          />
          <button type="submit">공개 내리기</button>
          <span>공개 목록과 상세 페이지에서 숨기고 검수 대기로 되돌립니다.</span>
        </form>
      ) : null}
    </>
  );
}
