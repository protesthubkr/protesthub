import type { SupabaseClient } from "@supabase/supabase-js";
import type { XEventCandidateInsertRow } from "./candidate-rows";

type ExistingReviewCandidateRow = {
  id: string;
  review_reason: string[] | null;
  source_record_id: string;
  status: string;
};

export type CandidateInsertResult = {
  created: number;
  ignoredCreated: number;
  needsReviewCreated: number;
  promoted: number;
};

export async function insertCandidateRows(
  supabase: SupabaseClient,
  rows: XEventCandidateInsertRow[],
) {
  const uniqueRows = Array.from(
    new Map(
      rows.map((row) => [`${row.source_type}:${row.source_record_id}`, row]),
    ).values(),
  );

  if (uniqueRows.length === 0) {
    return createEmptyCandidateInsertResult();
  }

  const existingCandidates = await getExistingReviewCandidates(
    supabase,
    uniqueRows.map((row) => row.source_record_id),
  );
  const existingRecordIds = new Set(
    existingCandidates.map((candidate) => candidate.source_record_id),
  );
  const newRows = uniqueRows.filter(
    (row) => !existingRecordIds.has(row.source_record_id),
  );
  const insertedRows = await insertNewCandidateRows(supabase, newRows);

  const promoted = await promoteAutoIgnoredCandidates(
    supabase,
    uniqueRows,
    existingCandidates,
  );

  return {
    created: insertedRows.length,
    ignoredCreated: insertedRows.filter((row) => row.status === "ignored")
      .length,
    needsReviewCreated: insertedRows.filter(
      (row) => row.status === "needs_review",
    ).length,
    promoted,
  };
}

function createEmptyCandidateInsertResult(): CandidateInsertResult {
  return {
    created: 0,
    ignoredCreated: 0,
    needsReviewCreated: 0,
    promoted: 0,
  };
}

async function insertNewCandidateRows(
  supabase: SupabaseClient,
  rows: XEventCandidateInsertRow[],
) {
  if (rows.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .upsert(rows, {
      onConflict: "source_type,source_record_id",
      ignoreDuplicates: true,
    })
    .select("id,status");

  if (error) {
    throw new Error(error.message);
  }

  return (data as { id: string; status: "needs_review" | "ignored" }[] | null) ??
    [];
}

async function getExistingReviewCandidates(
  supabase: SupabaseClient,
  sourceRecordIds: string[],
) {
  if (sourceRecordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .select("id,source_record_id,status,review_reason")
    .eq("source_type", "x")
    .in("source_record_id", sourceRecordIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data as ExistingReviewCandidateRow[] | null) ?? [];
}

async function promoteAutoIgnoredCandidates(
  supabase: SupabaseClient,
  rows: XEventCandidateInsertRow[],
  existingCandidates: ExistingReviewCandidateRow[],
) {
  const reviewRowsByRecordId = new Map(
    rows
      .filter((row) => row.status === "needs_review")
      .map((row) => [row.source_record_id, row]),
  );
  let promoted = 0;

  for (const candidate of existingCandidates) {
    const nextRow = reviewRowsByRecordId.get(candidate.source_record_id);

    if (
      !nextRow ||
      candidate.status !== "ignored" ||
      hasProtectedReviewDecision(candidate.review_reason ?? [])
    ) {
      continue;
    }

    const { error } = await supabase
      .from("review_candidates")
      .update({
        extraction_payload: nextRow.extraction_payload,
        media_keys: nextRow.media_keys,
        review_reason: mergeReviewReasons(candidate.review_reason ?? [], [
          ...nextRow.review_reason,
          "review_reopened_by_current_heuristic",
        ]),
        status: "needs_review",
        text_snapshot: nextRow.text_snapshot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id)
      .eq("status", "ignored");

    if (error) {
      throw new Error(error.message);
    }

    promoted += 1;
  }

  return promoted;
}

function hasProtectedReviewDecision(reasons: string[]) {
  return reasons.some(
    (reason) =>
      reason.startsWith("admin_") ||
      reason === "published_event" ||
      reason === "unpublished_event",
  );
}

function mergeReviewReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
