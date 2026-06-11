export function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}

export function hasProtectedReviewDecision(reasons: string[]) {
  return reasons.some(
    (reason) =>
      reason.startsWith("admin_") ||
      reason.startsWith("manual_") ||
      reason === "manual_review_requested" ||
      reason === "published_event" ||
      reason === "unpublished_event",
  );
}
