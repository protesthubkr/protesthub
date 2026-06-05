import type {
  CandidateReviewScope,
  CandidateStatusFilter,
  ReviewCandidate,
} from "@/lib/admin-candidates";
import { ISSUE_OPTIONS } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import {
  getPublishFormDefaults,
  normalizeTimeInput,
} from "./publish-defaults";
import type { StructuredEventResult } from "./structured-event-view";
import { publishCandidateEvent } from "./actions";

type PublishEventFormProps = {
  candidate: ReviewCandidate;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
  structuredEvent: StructuredEventResult;
};

export function PublishEventForm({
  candidate,
  currentStatus,
  scope,
  secret,
  structuredEvent,
}: PublishEventFormProps) {
  const defaults = getPublishFormDefaults(candidate, structuredEvent);

  return (
    <details className="admin-publish-panel">
      <summary>
        {candidate.status === "published" ? "공개 수정" : "공개하기"}
      </summary>
      <form action={publishCandidateEvent} className="admin-publish-form">
        <HiddenAdminFields
          candidateId={candidate.id}
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

        <label>
          설명
          <textarea defaultValue={defaults.description} name="description" rows={3} />
        </label>

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
  );
}

export function HiddenAdminFields({
  candidateId,
  currentStatus,
  scope,
  secret,
}: {
  candidateId: string;
  currentStatus: CandidateStatusFilter;
  scope: CandidateReviewScope;
  secret: string;
}) {
  return (
    <>
      <input name="secret" type="hidden" value={secret} />
      <input name="candidate_id" type="hidden" value={candidateId} />
      <input name="return_status" type="hidden" value={currentStatus} />
      <input name="return_scope" type="hidden" value={scope} />
    </>
  );
}
