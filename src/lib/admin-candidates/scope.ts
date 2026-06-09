import type {
  CandidateReviewScope,
  CandidateSignalFields,
  CandidateStatusFilter,
  ReviewCandidate,
} from "./types";
import { ADMIN_CANDIDATES_PAGE_SIZE } from "./types";

export function isLowSignalCandidate(candidate: CandidateSignalFields) {
  const reasons = candidate.candidateReason;

  if (reasons.includes("low_confidence_image_only")) {
    return true;
  }

  if (reasons.includes("heuristic:v2")) {
    return false;
  }

  if (reasons.length === 1 && reasons[0] === "has_photo_media") {
    return true;
  }

  const keywordReasons = reasons
    .filter((reason) => reason.startsWith("keyword:"))
    .map((reason) => reason.replace("keyword:", ""));

  if (keywordReasons.length === 0) {
    return false;
  }

  const hasStrongKeyword = keywordReasons.some((keyword) =>
    [
      "집회",
      "시위",
      "기자회견",
      "문화제",
      "행진",
      "농성",
      "촛불",
      "궐기",
      "추모",
    ].includes(keyword),
  );

  return !hasStrongKeyword;
}

export function isCandidateVisibleInScope(
  candidate: CandidateSignalFields,
  scope: CandidateReviewScope,
) {
  if (scope === "focused") {
    return !isLowSignalCandidate(candidate);
  }

  if (scope === "image") {
    return isLowSignalCandidate(candidate) && candidate.mediaKeys.length > 0;
  }

  return true;
}

export function filterCandidatesByScope(
  candidates: ReviewCandidate[],
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
) {
  if (status !== "needs_review") {
    return candidates;
  }

  return candidates.filter((candidate) =>
    isCandidateVisibleInScope(candidate, scope),
  );
}

export function getCandidateQueryLimit(
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
  visibleLimit: number,
) {
  if (status === "needs_review" && scope !== "all") {
    return Math.max(visibleLimit + ADMIN_CANDIDATES_PAGE_SIZE, 500);
  }

  return visibleLimit + 1;
}

export function hasMoreReviewCandidates({
  counts,
  scope,
  status,
  visibleLimit,
}: {
  counts: Record<CandidateStatusFilter, number>;
  scope: CandidateReviewScope;
  status: CandidateStatusFilter;
  visibleLimit: number;
}) {
  if (status === "needs_review" && scope !== "all") {
    return counts.needs_review > visibleLimit;
  }

  return counts[status] > visibleLimit;
}
