export type CandidatePromotionRow = {
  id: string;
  source_record_id: string;
  source_type: "x" | "telegram";
  source_name: string;
  source_url: string;
  text_snapshot: string;
  media_keys: string[] | null;
  extraction_payload: Record<string, unknown> | null;
  review_reason: string[] | null;
  created_at: string;
  updated_at: string;
};

export type PublicEventOverlapRow = {
  id: string;
  title: string;
  venue: string;
  address: string;
  region: string;
  source_account_name: string;
  source_post_url: string;
  dates: { date: string; start_time: string | null }[];
};

export type IgnoredCandidatePromotionResult = {
  scanned: number;
  eligible: number;
  promoted: number;
  skipped: {
    alreadyTouched: number;
    noReviewRule: number;
    pastEventDate: number;
    protectedDecision: number;
    publicEventOverlap: number;
  };
  samples: {
    accountName: string;
    id: string;
    reasons: string[];
    sourcePostUrl: string;
    text: string;
  }[];
};
