import type { PublicEvent } from "@/lib/types";
import { mergeCandidateMediaKeys } from "@/lib/x-ingest/hydration-state";
import {
  getReviewCandidateSourceType,
  type ReviewCandidateSourceType,
} from "../review-candidate-source";
import type {
  CandidateMedia,
  CandidateScopeCountRow,
  CandidateSignalFields,
  CandidateStatusFilter,
  CandidateRow,
  PublicEventRow,
  ReviewCandidate,
} from "./types";

export function mapPublicEventRow(row: PublicEventRow): PublicEvent {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    address: row.address,
    region: row.region,
    organizerName: row.organizer_name?.trim() || undefined,
    sourceAccountName: row.source_account_name,
    sourcePostUrl: row.source_post_url,
    cancelSourceUrl: row.cancel_source_url ?? undefined,
    issueTags: row.issue_tags,
    primaryIssue: row.primary_issue,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    posterImageUrl: row.poster_image_url ?? undefined,
    dates: row.dates.map((date) => ({
      date: date.date,
      startTime: date.start_time,
    })),
  };
}

export function mapCandidateRow(
  row: CandidateRow,
  mediaByKey: Map<string, CandidateMedia>,
  publicEventsById: Map<string, PublicEvent>,
  postMediaKeysByPostId: Map<string, string[]>,
): ReviewCandidate {
  const mediaKeys = getMergedCandidateMediaKeys(row, postMediaKeysByPostId);

  return {
    id: row.id,
    sourceRecordId: row.source_record_id,
    sourceType: getReviewCandidateSourceType({
      ...(row.extraction_payload ?? {}),
      source_type: row.source_type,
    }),
    status: row.status,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    textSnapshot: row.text_snapshot,
    mediaKeys,
    ocrText: row.ocr_text ?? "",
    extractionPayload: row.extraction_payload ?? {},
    candidateReason: row.review_reason ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: mediaKeys
      .map((mediaKey) => mediaByKey.get(mediaKey))
      .filter((media): media is CandidateMedia => Boolean(media)),
    publicEvent: publicEventsById.get(row.id) ?? null,
  };
}

export function createEmptyCounts(): Record<CandidateStatusFilter, number> {
  return {
    needs_review: 0,
    ignored: 0,
    duplicate: 0,
    canceled: 0,
    published: 0,
    all: 0,
  };
}

export function mapCandidateSignalFields(
  row: CandidateScopeCountRow,
  postMediaKeysByPostId: Map<string, string[]> = new Map(),
): CandidateSignalFields {
  return {
    candidateReason: row.review_reason ?? [],
    mediaKeys: getMergedCandidateMediaKeys(row, postMediaKeysByPostId),
  };
}

export function getMergedCandidateMediaKeys(
  row: {
    media_keys: string[] | null;
    source_record_id: string;
    source_type?: ReviewCandidateSourceType | null;
  },
  postMediaKeysByPostId: Map<string, string[]>,
) {
  return mergeCandidateMediaKeys(
    row.media_keys,
    row.source_type === "x"
      ? postMediaKeysByPostId.get(row.source_record_id)
      : undefined,
  );
}
