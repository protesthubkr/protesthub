export type ReviewCandidateSourceType = "x" | "telegram";

export function getReviewCandidateSourceType(
  payload: Record<string, unknown> | null | undefined,
): ReviewCandidateSourceType {
  const sourceType = payload?.source_type;

  if (sourceType === "telegram") {
    return "telegram";
  }

  return "x";
}

export function getSourceViewLabel(sourceType: ReviewCandidateSourceType) {
  switch (sourceType) {
    case "telegram":
      return "텔레그램에서 보기";
    case "x":
      return "X에서 보기";
  }
}

export function getSourceTextOnlyExtractionHint(
  sourceType: ReviewCandidateSourceType,
) {
  switch (sourceType) {
    case "telegram":
      return "텔레그램 본문만 사용";
    case "x":
      return "X 본문만 사용";
  }
}

export function getPublicSourceViewLabel(status: "published" | "canceled") {
  return status === "canceled" ? "취소 출처 보기" : "원본 보기";
}
