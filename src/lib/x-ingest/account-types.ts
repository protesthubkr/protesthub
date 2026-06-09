export type AccountIngestCursor = {
  lastIngestedAt?: string;
  lastIngestedPostCreatedAt?: string;
  sinceId?: string;
  source: "account_cursor" | "latest_saved_post" | "none";
  startTime?: string;
};

export type PostCursor = {
  createdAt: string;
  postId: string;
};

export type AccountIngestCursorUpdate = {
  accountId: string;
  checkedAt: string;
  latestPost?: PostCursor;
  runId: string;
};

export type AccountCursorRow = {
  last_ingested_at: string | null;
  last_ingested_post_created_at: string | null;
  last_ingested_post_id: string | null;
};

export type StoredAccountRow = {
  account_name: string;
  is_protected: boolean;
  is_verified: boolean | null;
  raw_payload: unknown;
  username: string;
  x_user_id: string;
};

export type LatestPostCursorRow = {
  created_at: string | null;
  x_post_id: string;
};

export type ExistingAccountUpsertRow = {
  account_name: string;
  raw_payload: unknown;
  username: string;
  x_user_id: string;
};
