import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { IssueKey, PublicEvent } from "@/lib/types";

export type CandidateStatus =
  | "needs_review"
  | "ignored"
  | "published"
  | "canceled"
  | "duplicate";

export type CandidateStatusFilter = CandidateStatus | "all";

export type CandidateReviewScope = "focused" | "image" | "all";

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
  xPostId: string;
  status: CandidateStatus;
  sourceAccountName: string;
  sourcePostUrl: string;
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
  x_post_id: string;
  status: CandidateStatus;
  source_account_name: string;
  source_post_url: string;
  text_snapshot: string;
  media_keys: string[];
  ocr_text: string | null;
  extraction_payload: Record<string, unknown>;
  candidate_reason: string[];
  created_at: string;
  updated_at: string;
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
  description: string | null;
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

export async function getReviewCandidates(
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      candidates: [] as ReviewCandidate[],
      counts: createEmptyCounts(),
      error: "Supabase service role 환경변수가 설정되지 않았습니다.",
    };
  }

  let query = supabase
    .from("x_event_candidates")
    .select(
      [
        "id",
        "x_post_id",
        "status",
        "source_account_name",
        "source_post_url",
        "text_snapshot",
        "media_keys",
        "ocr_text",
        "extraction_payload",
        "candidate_reason",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(
      status === "needs_review" && scope !== "all" ? 500 : 50,
    );

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const [{ data, error }, counts] = await Promise.all([
    query,
    getCandidateCounts(),
  ]);

  if (error || !data) {
    return {
      candidates: [] as ReviewCandidate[],
      counts,
      error: error?.message ?? "후보 목록을 불러오지 못했습니다.",
    };
  }

  const rows = data as unknown as CandidateRow[];
  const [mediaByKey, publicEventsById] = await Promise.all([
    getCandidateMedia(rows.flatMap((row) => row.media_keys)),
    getCandidatePublicEvents(rows.map((row) => row.id)),
  ]);
  const candidates = rows.map((row) =>
    mapCandidateRow(row, mediaByKey, publicEventsById),
  );
  const visibleCandidates = filterCandidatesByScope(candidates, status, scope);

  return {
    candidates: visibleCandidates.slice(0, 50),
    counts,
    error: null,
  };
}

export async function getCandidateCounts() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return createEmptyCounts();
  }

  const entries = await Promise.all(
    CANDIDATE_STATUS_FILTERS.filter((status) => status !== "all").map(
      async (status) => {
        const { count } = await supabase
          .from("x_event_candidates")
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

  return counts;
}

async function getCandidateMedia(mediaKeys: string[]) {
  const supabase = getSupabaseAdminClient();
  const uniqueMediaKeys = Array.from(new Set(mediaKeys));

  if (!supabase || uniqueMediaKeys.length === 0) {
    return new Map<string, CandidateMedia>();
  }

  const { data, error } = await supabase
    .from("x_media")
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
    description: row.description ?? "",
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
): ReviewCandidate {
  return {
    id: row.id,
    xPostId: row.x_post_id,
    status: row.status,
    sourceAccountName: row.source_account_name,
    sourcePostUrl: row.source_post_url,
    textSnapshot: row.text_snapshot,
    mediaKeys: row.media_keys,
    ocrText: row.ocr_text ?? "",
    extractionPayload: row.extraction_payload ?? {},
    candidateReason: row.candidate_reason ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: row.media_keys
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

function isLowSignalCandidate(candidate: ReviewCandidate) {
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

function filterCandidatesByScope(
  candidates: ReviewCandidate[],
  status: CandidateStatusFilter,
  scope: CandidateReviewScope,
) {
  if (status !== "needs_review") {
    return candidates;
  }

  if (scope === "focused") {
    return candidates.filter((candidate) => !isLowSignalCandidate(candidate));
  }

  if (scope === "image") {
    return candidates.filter(
      (candidate) =>
        isLowSignalCandidate(candidate) && candidate.media.length > 0,
    );
  }

  return candidates;
}
