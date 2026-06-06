import type { XHydrateMode } from "./types";

export const X_DETAIL_DEFERRED_REASON = "x_detail_deferred";
export const X_DETAIL_HYDRATED_REASON = "x_detail_hydrated";
export const X_UNHYDRATED_MEDIA_REASON = "has_unhydrated_media";
export const X_UNHYDRATED_QUOTE_REASON = "has_unhydrated_quote";

export type XDetailHydrationStatus = "deferred" | "hydrated";

export type XDetailHydrationState = {
  needsDetail: boolean;
  status: XDetailHydrationStatus;
  pendingMediaKeys: string[];
  pendingQuotedPostIds: string[];
};

export function getCandidateDetailHydrationState(
  payload: Record<string, unknown> | null | undefined,
  mediaKeys: string[] = [],
): XDetailHydrationState {
  const hydration = getObject(payload?.x_hydration);
  const status =
    hydration?.status === "hydrated" ? "hydrated" : "deferred";
  const pendingMediaKeys = mergeCandidateMediaKeys(
    getStringArray(hydration?.pending_media_keys),
    mediaKeys,
  );
  const pendingQuotedPostIds = getStringArray(
    hydration?.pending_quoted_post_ids,
  );
  const quotedPostIds =
    pendingQuotedPostIds.length > 0
      ? pendingQuotedPostIds
      : getStringArray(payload?.quoted_post_ids);
  const needsDetail =
    status === "deferred" &&
    (pendingMediaKeys.length > 0 ||
      quotedPostIds.length > 0 ||
      hydration?.needs_detail === true);

  return {
    needsDetail,
    status,
    pendingMediaKeys,
    pendingQuotedPostIds: quotedPostIds,
  };
}

export function needsCandidateDetailHydration(
  payload: Record<string, unknown> | null | undefined,
  mediaKeys: string[] = [],
) {
  return getCandidateDetailHydrationState(payload, mediaKeys).needsDetail;
}

export function mergeCandidateMediaKeys(
  ...mediaKeyGroups: Array<readonly string[] | null | undefined>
) {
  return Array.from(
    new Set(
      mediaKeyGroups.flatMap((mediaKeys) =>
        (mediaKeys ?? []).filter((mediaKey) => mediaKey.length > 0),
      ),
    ),
  );
}

export function getCandidateDetailHydrationReasons({
  hydrateMode,
  mediaKeys,
  quotedPostIds,
}: {
  hydrateMode: XHydrateMode;
  mediaKeys: string[];
  quotedPostIds: string[];
}) {
  const hasHydratableDetails = mediaKeys.length > 0 || quotedPostIds.length > 0;

  if (hydrateMode !== "deferred") {
    return hasHydratableDetails ? [X_DETAIL_HYDRATED_REASON] : [];
  }

  if (!hasHydratableDetails) {
    return [];
  }

  const reasons = [X_DETAIL_DEFERRED_REASON];

  if (mediaKeys.length > 0) {
    reasons.push(X_UNHYDRATED_MEDIA_REASON);
  }

  if (quotedPostIds.length > 0) {
    reasons.push(X_UNHYDRATED_QUOTE_REASON);
  }

  return reasons;
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
