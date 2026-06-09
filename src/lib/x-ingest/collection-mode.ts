export function getCollectionMode({
  isBackfill,
  retweetOriginalsOnly,
  shouldRefreshFollowing,
}: {
  isBackfill: boolean;
  retweetOriginalsOnly: boolean;
  shouldRefreshFollowing: boolean;
}) {
  if (retweetOriginalsOnly) {
    return isBackfill
      ? "retweet_original_backfill_from_start_time"
      : "retweet_original_cursor_probe";
  }

  if (isBackfill) {
    return "bounded_backfill_from_start_time";
  }

  return shouldRefreshFollowing
    ? "following_refresh_account_cursor_incremental"
    : "account_cursor_incremental";
}
