import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { IssueKey, PublicEvent } from "@/lib/types";
import { mergeCandidateMediaKeys } from "@/lib/x-ingest/hydration-state";
import { getAttachmentMediaKeysByPostId } from "@/lib/x-ingest/repository";
import {
  getReviewCandidateSourceType,
  type ReviewCandidateSourceType,
} from "./review-candidate-source";

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

type CandidateRow = {
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

type CandidateSignalFields = {
  candidateReason: string[];
  mediaKeys: string[];
};

type CandidateScopeCountRow = {
  source_record_id: string;
  source_type: ReviewCandidateSourceType | null;
  review_reason: string[] | null;
  media_keys: string[] | null;
};

type MediaRow = {
  media_key: string;
  media_type: string;
  url: string | null;
  preview_image_url: string | null;
  alt_text: string | null;
  width: number | null;
  height: number | null;
};

type PublicEventRow = {
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

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatusFilter, string> = {
  needs_review: "검수 대기",
  ignored: "무시",
  duplicate: "중복",
  canceled: "취소 후보",
  published: "공개 처리됨",
  all: "전체",
};

export const CANDIDATE_STATUS_FILTERS: CandidateStatusFilter[] = [
  "needs_review",
  "ignored",
  "duplicate",
  "canceled",
  "published",
  "all",
];

export const CANDIDATE_REVIEW_SCOPE_LABELS: Record<
  CandidateReviewScope,
  string
> = {
  focused: "추천 검수",
  image: "이미지 확인",
  all: "전체 후보",
};

export const CANDIDATE_REVIEW_SCOPES: CandidateReviewScope[] = [
  "focused",
  "image",
  "all",
];

export function parseCandidateStatusFilter(
  value: string | undefined,
): CandidateStatusFilter {
  return CANDIDATE_STATUS_FILTERS.includes(value as CandidateStatusFilter)
    ? (value as CandidateStatusFilter)
    : "needs_review";
}

export function parseCandidateReviewScope(
  value: string | undefined,
): CandidateReviewScope {
  return CANDIDATE_REVIEW_SCOPES.includes(value as CandidateReviewScope)
    ? (value as CandidateReviewScope)
    : "focused";
}

export function parseCandidatePageParam(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export async function getReviewCandidates(
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
  page = 1,
) {
  const supabase = getSupabaseAdminClient();
  const visibleLimit = page * ADMIN_CANDIDATES_PAGE_SIZE;

  if (!supabase) {
    return {
      candidates: [] as ReviewCandidate[],
      counts: createEmptyCounts(),
      error: "Supabase service role 환경변수가 설정되지 않았습니다.",
      hasMoreCandidates: false,
    };
  }

  let query = supabase
    .from("review_candidates")
    .select(
      [
        "id",
        "source_record_id",
        "source_type",
        "status",
        "source_name",
        "source_url",
        "text_snapshot",
        "media_keys",
        "ocr_text",
        "extraction_payload",
        "review_reason",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(getCandidateQueryLimit(status, scope, visibleLimit));

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const [{ data, error }, counts] = await Promise.all([
    query,
    getCandidateCounts(scope),
  ]);

  if (error || !data) {
    return {
      candidates: [] as ReviewCandidate[],
      counts,
      error: error?.message ?? "후보 목록을 불러오지 못했습니다.",
      hasMoreCandidates: false,
    };
  }

  const rows = data as unknown as CandidateRow[];
  const postMediaKeysByPostId = await getAttachmentMediaKeysByPostId(
    supabase,
    rows
      .filter((row) => row.source_type === "x")
      .map((row) => row.source_record_id),
  );
  const mergedMediaKeys = rows.flatMap((row) =>
    getMergedCandidateMediaKeys(row, postMediaKeysByPostId),
  );
  const [mediaByKey, publicEventsById] = await Promise.all([
    getCandidateMedia(mergedMediaKeys),
    getCandidatePublicEvents(rows.map((row) => row.id)),
  ]);
  const candidates = rows.map((row) =>
    mapCandidateRow(row, mediaByKey, publicEventsById, postMediaKeysByPostId),
  );
  const visibleCandidates = filterCandidatesByScope(candidates, status, scope);
  const hasMoreCandidates = hasMoreReviewCandidates({
    counts,
    scope,
    status,
    visibleLimit,
  });

  return {
    candidates: visibleCandidates.slice(0, visibleLimit),
    counts,
    error: null,
    hasMoreCandidates,
  };
}

export async function getCandidateCounts(scope: CandidateReviewScope = "all") {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return createEmptyCounts();
  }

  const entries = await Promise.all(
    CANDIDATE_STATUS_FILTERS.filter((status) => status !== "all").map(
      async (status) => {
        const { count } = await supabase
          .from("review_candidates")
          .select("id", { count: "exact", head: true })
          .eq("status", status);

        return [status, count ?? 0] as const;
      },
    ),
  );
  const counts = createEmptyCounts();

  entries.forEach(([status, count]) => {
    counts[status] = count;
  });
  counts.all = entries.reduce((sum, [, count]) => sum + count, 0);

  if (scope !== "all") {
    counts.needs_review = await getScopedNeedsReviewCount(supabase, scope);
  }

  return counts;
}

async function getScopedNeedsReviewCount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  scope: CandidateReviewScope,
) {
  const { data, error } = await supabase
    .from("review_candidates")
    .select("source_record_id,source_type,review_reason,media_keys")
    .eq("status", "needs_review");

  if (error || !data) {
    return 0;
  }

  const rows = data as unknown as CandidateScopeCountRow[];
  const postMediaKeysByPostId = await getAttachmentMediaKeysByPostId(
    supabase,
    rows
      .filter((row) => row.source_type === "x")
      .map((row) => row.source_record_id),
  );

  return rows.filter((row) =>
    isCandidateVisibleInScope(
      mapCandidateSignalFields(row, postMediaKeysByPostId),
      scope,
    ),
  ).length;
}

async function getCandidateMedia(mediaKeys: string[]) {
  const supabase = getSupabaseAdminClient();
  const uniqueMediaKeys = Array.from(new Set(mediaKeys));

  if (!supabase || uniqueMediaKeys.length === 0) {
    return new Map<string, CandidateMedia>();
  }

  const { data, error } = await supabase
    .from("source_media")
    .select(
      "media_key,media_type,url,preview_image_url,alt_text,width,height",
    )
    .in("media_key", uniqueMediaKeys);

  if (error || !data) {
    return new Map<string, CandidateMedia>();
  }

  return new Map(
    (data as unknown as MediaRow[]).map((media) => [
      media.media_key,
      {
        mediaKey: media.media_key,
        mediaType: media.media_type,
        url: media.url,
        previewImageUrl: media.preview_image_url,
        altText: media.alt_text,
        width: media.width,
        height: media.height,
      },
    ]),
  );
}

async function getCandidatePublicEvents(candidateIds: string[]) {
  const supabase = getSupabaseAdminClient();
  const uniqueCandidateIds = Array.from(new Set(candidateIds));

  if (!supabase || uniqueCandidateIds.length === 0) {
    return new Map<string, PublicEvent>();
  }

  const { data, error } = await supabase
    .from("public_event_cards")
    .select("*")
    .in("id", uniqueCandidateIds);

  if (error || !data) {
    return new Map<string, PublicEvent>();
  }

  return new Map(
    (data as unknown as PublicEventRow[]).map((row) => [
      row.id,
      mapPublicEventRow(row),
    ]),
  );
}

function mapPublicEventRow(row: PublicEventRow): PublicEvent {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    address: row.address,
    region: row.region,
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

function mapCandidateRow(
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

function createEmptyCounts(): Record<CandidateStatusFilter, number> {
  return {
    needs_review: 0,
    ignored: 0,
    duplicate: 0,
    canceled: 0,
    published: 0,
    all: 0,
  };
}

function mapCandidateSignalFields(
  row: CandidateScopeCountRow,
  postMediaKeysByPostId: Map<string, string[]> = new Map(),
): CandidateSignalFields {
  return {
    candidateReason: row.review_reason ?? [],
    mediaKeys: getMergedCandidateMediaKeys(row, postMediaKeysByPostId),
  };
}

function getMergedCandidateMediaKeys(
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

function isLowSignalCandidate(candidate: CandidateSignalFields) {
  const reasons = candidate.candidateReason;

  if (reasons.includes("low_confidence_image_only")) {
    return true;
  }

  if (reasons.includes("heuristic:v2")) {
    return false;
  }

  if (reasons.length === 1 && reasons[0] === "has_photo_media") {
    return true;
  }

  const keywordReasons = reasons
    .filter((reason) => reason.startsWith("keyword:"))
    .map((reason) => reason.replace("keyword:", ""));

  if (keywordReasons.length === 0) {
    return false;
  }

  const hasStrongKeyword = keywordReasons.some((keyword) =>
    [
      "집회",
      "시위",
      "기자회견",
      "문화제",
      "행진",
      "농성",
      "촛불",
      "궐기",
      "추모",
    ].includes(keyword),
  );

  return !hasStrongKeyword;
}

function isCandidateVisibleInScope(
  candidate: CandidateSignalFields,
  scope: CandidateReviewScope,
) {
  if (scope === "focused") {
    return !isLowSignalCandidate(candidate);
  }

  if (scope === "image") {
    return isLowSignalCandidate(candidate) && candidate.mediaKeys.length > 0;
  }

  return true;
}

function filterCandidatesByScope(
  candidates: ReviewCandidate[],
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
) {
  if (status !== "needs_review") {
    return candidates;
  }

  return candidates.filter((candidate) =>
    isCandidateVisibleInScope(candidate, scope),
  );
}

function getCandidateQueryLimit(
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
  visibleLimit: number,
) {
  if (status === "needs_review" && scope !== "all") {
    return Math.max(visibleLimit + ADMIN_CANDIDATES_PAGE_SIZE, 500);
  }

  return visibleLimit + 1;
}

function hasMoreReviewCandidates({
  counts,
  scope,
  status,
  visibleLimit,
}: {
  counts: Record<CandidateStatusFilter, number>;
  scope: CandidateReviewScope;
  status: CandidateStatusFilter;
  visibleLimit: number;
}) {
  if (status === "needs_review" && scope !== "all") {
    return counts.needs_review > visibleLimit;
  }

  return counts[status] > visibleLimit;
}
