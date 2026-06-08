import { isAdminSecretValid } from "@/lib/admin-auth";
import {
  CANDIDATE_STATUS_FILTERS,
  type CandidateReviewScope,
  type CandidateStatus,
  type CandidateStatusFilter,
  parseCandidatePageParam,
  parseCandidateReviewScope,
  parseCandidateStatusFilter,
} from "@/lib/admin-candidates";
import { ISSUE_OPTIONS } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import type { IssueKey } from "@/lib/types";
import { getAdminCandidatesHref } from "./navigation";

export type PublishEventDate = {
  date: string;
  startTime: string | null;
};

export type AdminReturnState = {
  page: number;
  scope: CandidateReviewScope;
  status: CandidateStatusFilter;
};

const ISSUE_KEYS = ISSUE_OPTIONS.map((issue) => issue.key);
const ISSUE_KEY_SET = new Set<IssueKey>(ISSUE_KEYS);
const REGION_SET = new Set(REGION_OPTIONS);

export function assertAdmin(secret: string) {
  if (!isAdminSecretValid(secret)) {
    throw new Error("Unauthorized admin action.");
  }
}

export function getCandidateStatus(formData: FormData): CandidateStatus {
  const status = getRequiredString(formData, "status");

  if (
    status === "all" ||
    !CANDIDATE_STATUS_FILTERS.includes(status as CandidateStatusFilter)
  ) {
    throw new Error(`Invalid candidate status: ${status}`);
  }

  return status as CandidateStatus;
}

export function getRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || !value) {
    throw new Error(`Missing form value: ${key}`);
  }

  return value;
}

export function getTrimmedRequiredString(formData: FormData, key: string) {
  const value = getRequiredString(formData, key).trim();

  if (!value) {
    throw new Error(`Missing form value: ${key}`);
  }

  return value;
}

export function getOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export function getAdminReturnState(formData: FormData): AdminReturnState {
  return {
    page: parseCandidatePageParam(getOptionalString(formData, "return_page")),
    scope: parseCandidateReviewScope(getOptionalString(formData, "return_scope")),
    status: parseCandidateStatusFilter(
      getOptionalString(formData, "return_status"),
    ),
  };
}

export function getValidRegion(formData: FormData) {
  const region = getTrimmedRequiredString(formData, "region");

  if (!REGION_SET.has(region)) {
    throw new Error(`Invalid region: ${region}`);
  }

  return region;
}

export function getValidIssueTags(formData: FormData) {
  const tags = formData
    .getAll("issue_tags")
    .filter((tag): tag is IssueKey =>
      typeof tag === "string" && ISSUE_KEY_SET.has(tag as IssueKey),
    );
  const uniqueTags = Array.from(new Set(tags));

  if (uniqueTags.length === 0) {
    throw new Error("공개하려면 의제 태그를 하나 이상 선택해야 합니다.");
  }

  return uniqueTags;
}

export function getValidPrimaryIssue(
  formData: FormData,
  issueTags: IssueKey[],
) {
  const primaryIssue = getTrimmedRequiredString(formData, "primary_issue");

  if (!ISSUE_KEY_SET.has(primaryIssue as IssueKey)) {
    throw new Error(`Invalid primary issue: ${primaryIssue}`);
  }

  if (!issueTags.includes(primaryIssue as IssueKey)) {
    return issueTags[0];
  }

  return primaryIssue as IssueKey;
}

export function getPublishEventDates(formData: FormData) {
  const dateValues = formData.getAll("event_date");
  const timeValues = formData.getAll("start_time");
  const dates = dateValues
    .map((dateValue, index): PublishEventDate | null => {
      if (typeof dateValue !== "string") {
        return null;
      }

      const date = dateValue.trim();

      if (!date) {
        return null;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid event date: ${date}`);
      }

      const timeValue = timeValues[index];
      const startTime =
        typeof timeValue === "string" && timeValue.trim()
          ? timeValue.trim()
          : null;

      if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
        throw new Error(`Invalid event start time: ${startTime}`);
      }

      return { date, startTime };
    })
    .filter((date): date is PublishEventDate => Boolean(date));

  if (dates.length === 0) {
    throw new Error("공개하려면 날짜를 하나 이상 입력해야 합니다.");
  }

  return dates;
}

export function getAdminRedirectPath(
  secret: string,
  returnState: AdminReturnState,
) {
  return getAdminCandidatesHref({
    page: returnState.page,
    secret,
    status: returnState.status,
    scope: returnState.scope,
  });
}
