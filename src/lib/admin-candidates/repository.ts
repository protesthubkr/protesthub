import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { PublicEvent } from "@/lib/types";
import { getAttachmentMediaKeysByPostId } from "@/lib/x-ingest/repository";
import { CANDIDATE_STATUS_FILTERS } from "./filters";
import {
  createEmptyCounts,
  getMergedCandidateMediaKeys,
  mapCandidateRow,
  mapCandidateSignalFields,
  mapPublicEventRow,
} from "./mappers";
import {
  filterCandidatesByScope,
  getCandidateQueryLimit,
  hasMoreReviewCandidates,
  isCandidateVisibleInScope,
} from "./scope";
import {
  ADMIN_CANDIDATES_PAGE_SIZE,
  type CandidateMedia,
  type CandidateReviewScope,
  type CandidateRow,
  type CandidateScopeCountRow,
  type CandidateStatusFilter,
  type MediaRow,
  type PublicEventRow,
  type ReviewCandidate,
} from "./types";

type AdminSupabaseClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

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
  supabase: AdminSupabaseClient,
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
