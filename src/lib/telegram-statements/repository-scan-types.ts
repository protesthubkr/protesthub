export type StatementFeedSubscriptionRow = {
  channel_title: string | null;
  channel_username: string;
  last_checked_message_at: string | null;
  last_checked_message_id: number | null;
};

export type StatementScanStateRow = {
  channel_username: string;
  last_scanned_at: string | null;
  last_scanned_message_at: string | null;
  last_scanned_message_id: number | null;
  locked_at: string | null;
};
