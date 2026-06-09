import type { CandidateReviewScope, CandidateStatusFilter } from "./types";

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatusFilter, string> = {
  needs_review: "검수 대기",
  ignored: "무시",
  duplicate: "중복",
  canceled: "취소 후보",
  published: "공개 처리됨",
  all: "전체",
};

export const CANDIDATE_STATUS_FILTERS: CandidateStatusFilter[] = [
  "needs_review",
  "ignored",
  "duplicate",
  "canceled",
  "published",
  "all",
];

export const CANDIDATE_REVIEW_SCOPE_LABELS: Record<
  CandidateReviewScope,
  string
> = {
  focused: "추천 검수",
  image: "이미지 확인",
  all: "전체 후보",
};

export const CANDIDATE_REVIEW_SCOPES: CandidateReviewScope[] = [
  "focused",
  "image",
  "all",
];

export function parseCandidateStatusFilter(
  value: string | undefined,
): CandidateStatusFilter {
  return CANDIDATE_STATUS_FILTERS.includes(value as CandidateStatusFilter)
    ? (value as CandidateStatusFilter)
    : "needs_review";
}

export function parseCandidateReviewScope(
  value: string | undefined,
): CandidateReviewScope {
  return CANDIDATE_REVIEW_SCOPES.includes(value as CandidateReviewScope)
    ? (value as CandidateReviewScope)
    : "focused";
}

export function parseCandidatePageParam(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
