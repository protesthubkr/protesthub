export type XUser = {
  id: string;
  username: string;
  name: string;
  protected?: boolean;
  verified?: boolean;
  verified_type?: string;
  raw?: unknown;
};

export type XMedia = {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
};

export type XPost = {
  id: string;
  text?: string;
  note_tweet?: {
    text?: string;
  };
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  edit_history_tweet_ids?: string[];
  attachments?: {
    media_keys?: string[];
  };
  referenced_tweets?: {
    type: "retweeted" | "quoted" | "replied_to";
    id: string;
  }[];
  entities?: unknown;
  hydration_includes?: XIncludes;
};

export type XIncludes = {
  users?: XUser[];
  media?: XMedia[];
  tweets?: XPost[];
};

export type XTimelineResponse = {
  data?: XPost[];
  includes?: XIncludes;
  meta?: {
    result_count?: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
  errors?: unknown[];
};

export type XSinglePostResponse = {
  data?: XPost;
  includes?: XIncludes;
  errors?: unknown[];
};

export type XFollowingResponse = {
  data?: XUser[];
  meta?: {
    result_count?: number;
    next_token?: string;
  };
  errors?: unknown[];
};

export type XIngestConfig = {
  bearerToken: string;
  operatingUserId: string;
  postsPerAccount: number;
  maxFollowingAccounts: number;
  timelinePagesPerAccount: number;
  backfillTimelinePagesPerAccount: number;
  includeReplies: boolean;
};

export type XHydrateMode = "deferred" | "candidate_posts_only";

export type XIngestRunOptions = {
  hydrateMode?: XHydrateMode;
  maxTimelinePagesPerAccount?: number;
  refreshFollowing?: boolean;
  retweetOriginalsOnly?: boolean;
  reviewPastEventNotices?: boolean;
  startTime?: string;
};

export type XIngestResult = {
  runId: string;
  status: "succeeded";
  accountsSeen: number;
  postsSeen: number;
  postsWritten: number;
  candidatesCreated: number;
  candidatesPromoted: number;
  ignoredCandidatesCreated: number;
  needsReviewCandidatesCreated: number;
};
