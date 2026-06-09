import {
  X_DETAIL_DEFERRED_REASON,
  X_DETAIL_HYDRATED_REASON,
  X_UNHYDRATED_MEDIA_REASON,
  X_UNHYDRATED_QUOTE_REASON,
} from "./hydration-state";

export function mergeHydrationReasons(
  currentReasons: string[],
  nextReasons: string[],
) {
  const staleReasons = new Set([
    X_DETAIL_DEFERRED_REASON,
    X_UNHYDRATED_MEDIA_REASON,
    X_UNHYDRATED_QUOTE_REASON,
  ]);

  return Array.from(
    new Set([
      ...currentReasons.filter((reason) => !staleReasons.has(reason)),
      ...nextReasons,
      X_DETAIL_HYDRATED_REASON,
    ]),
  );
}
