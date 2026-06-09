export type CandidateHydrationRow = {
  id: string;
  source_record_id: string;
  media_keys: string[] | null;
  extraction_payload: Record<string, unknown> | null;
  review_reason: string[] | null;
};

export type CandidateDetailHydrationResult = {
  requested: number;
  hydrated: number;
  skipped: number;
  runId?: string;
};
