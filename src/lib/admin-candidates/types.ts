import type { IssueKey, PublicEvent } from "@/lib/types";
import type { ReviewCandidateSourceType } from "../review-candidate-source";

export type CandidateStatus =
  | "needs_review"
  | "ignored"
  | "published"
  | "canceled"
  | "duplicate";

export type CandidateStatusFilter = CandidateStatus | "all";

export type CandidateReviewScope = "focused" | "image" | "all";

export const ADMIN_CANDIDATES_PAGE_SIZE = 50;

export type CandidateMedia = {
  mediaKey: string;
  mediaType: string;
  url: string | null;
  previewImageUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type ReviewCandidate = {
  id: string;
  sourceRecordId: string;
  sourceType: ReviewCandidateSourceType;
  status: CandidateStatus;
  sourceName: string;
  sourceUrl: string;
  textSnapshot: string;
  mediaKeys: string[];
  ocrText: string;
  extractionPayload: Record<string, unknown>;
  candidateReason: string[];
  createdAt: string;
  updatedAt: string;
  media: CandidateMedia[];
  publicEvent: PublicEvent | null;
};

export type CandidateRow = {
  id: string;
  source_record_id: string;
  source_type: ReviewCandidateSourceType;
  status: CandidateStatus;
  source_name: string;
  source_url: string;
  text_snapshot: string;
  media_keys: string[];
  ocr_text: string | null;
  extraction_payload: Record<string, unknown>;
  review_reason: string[];
  created_at: string;
  updated_at: string;
};

export type CandidateSignalFields = {
  candidateReason: string[];
  mediaKeys: string[];
};

export type CandidateScopeCountRow = {
  source_record_id: string;
  source_type: ReviewCandidateSourceType | null;
  review_reason: string[] | null;
  media_keys: string[] | null;
};

export type MediaRow = {
  media_key: string;
  media_type: string;
  url: string | null;
  preview_image_url: string | null;
  alt_text: string | null;
  width: number | null;
  height: number | null;
};

export type PublicEventRow = {
  id: string;
  title: string;
  venue: string;
  address: string;
  region: string;
  source_account_name: string;
  source_post_url: string;
  cancel_source_url: string | null;
  issue_tags: IssueKey[];
  primary_issue: IssueKey;
  status: "published" | "canceled";
  last_checked_at: string;
  poster_image_url: string | null;
  dates: { date: string; start_time: string | null }[];
};
