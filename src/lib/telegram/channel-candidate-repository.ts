import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCandidateMediaKeys } from "@/lib/x-ingest/hydration-state";
import { TELEGRAM_CHANNEL_SCAN_SOURCE } from "./channel-subscription-types";
import {
  hasProtectedReviewDecision,
  mergeReasons,
} from "./channel-candidate-review";
import type { TelegramCandidateInsertRow } from "./channel-candidate-rows";

type ExistingTelegramCandidateRow = {
  extraction_payload: Record<string, unknown> | null;
  id: string;
  media_keys: string[] | null;
  review_reason: string[] | null;
  source_record_id: string;
  status: string;
  text_snapshot: string;
};

export async function upsertTelegramCandidateRows({
  rows,
  supabase,
}: {
  rows: TelegramCandidateInsertRow[];
  supabase: SupabaseClient;
}) {
  const existingCandidates = await getExistingTelegramCandidates(
    supabase,
    rows.map((row) => row.source_record_id),
  );
  const existingRecordIds = new Set(
    existingCandidates.map((candidate) => candidate.source_record_id),
  );
  const insertedRows = await insertNewTelegramCandidateRows(
    supabase,
    rows.filter((row) => !existingRecordIds.has(row.source_record_id)),
  );
  const existingUpdateResult = await updateExistingTelegramCandidates({
    existingCandidates,
    rows,
    supabase,
  });

  return {
    candidatesCreated: insertedRows.length,
    candidatesPromoted: existingUpdateResult.promoted,
    candidatesRefreshed: existingUpdateResult.refreshed,
    ignoredCreated: insertedRows.filter((row) => row.status === "ignored")
      .length,
    needsReviewCreated: insertedRows.filter(
      (row) => row.status === "needs_review",
    ).length,
  };
}

export function createEmptyTelegramCandidateInsertResult() {
  return {
    candidatesCreated: 0,
    candidatesPromoted: 0,
    candidatesRefreshed: 0,
    ignoredCreated: 0,
    needsReviewCreated: 0,
  };
}

async function insertNewTelegramCandidateRows(
  supabase: SupabaseClient,
  rows: TelegramCandidateInsertRow[],
) {
  if (rows.length === 0) {
    return [] satisfies Array<{ source_record_id: string; status: string }>;
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .upsert(rows, {
      ignoreDuplicates: true,
      onConflict: "source_type,source_record_id",
    })
    .select("source_record_id,status");

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data as Array<{ source_record_id: string; status: string }> | null) ?? []
  );
}

async function getExistingTelegramCandidates(
  supabase: SupabaseClient,
  sourceRecordIds: string[],
) {
  if (sourceRecordIds.length === 0) {
    return [] satisfies ExistingTelegramCandidateRow[];
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .select(
      "id,source_record_id,status,text_snapshot,media_keys,extraction_payload,review_reason",
    )
    .eq("source_type", "telegram")
    .in("source_record_id", sourceRecordIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data as ExistingTelegramCandidateRow[] | null) ?? [];
}

async function updateExistingTelegramCandidates({
  existingCandidates,
  rows,
  supabase,
}: {
  existingCandidates: ExistingTelegramCandidateRow[];
  rows: TelegramCandidateInsertRow[];
  supabase: SupabaseClient;
}) {
  const rowsByRecordId = new Map(
    rows.map((row) => [row.source_record_id, row]),
  );
  let promoted = 0;
  let refreshed = 0;

  for (const candidate of existingCandidates) {
    const nextRow = rowsByRecordId.get(candidate.source_record_id);

    if (
      !nextRow ||
      !canUpdateExistingTelegramCandidate(candidate) ||
      !shouldUpdateExistingTelegramCandidate(candidate, nextRow)
    ) {
      continue;
    }

    const now = new Date().toISOString();
    const shouldPromote =
      candidate.status === "ignored" && nextRow.status === "needs_review";
    const nextReasons = mergeReasons(candidate.review_reason ?? [], [
      ...nextRow.review_reason,
      "telegram_auto_scan_refreshed",
      ...(shouldPromote ? ["review_reopened_by_current_heuristic"] : []),
    ]);
    const nextPayload = {
      ...(candidate.extraction_payload ?? {}),
      ...nextRow.extraction_payload,
      telegram_auto_refresh: {
        refreshed_at: now,
        source: TELEGRAM_CHANNEL_SCAN_SOURCE,
      },
    };

    const { error } = await supabase
      .from("review_candidates")
      .update({
        extraction_payload: nextPayload,
        media_keys: mergeCandidateMediaKeys(
          candidate.media_keys,
          nextRow.media_keys,
        ),
        review_reason: nextReasons,
        source_name: nextRow.source_name,
        source_url: nextRow.source_url,
        status: shouldPromote ? "needs_review" : candidate.status,
        text_snapshot: nextRow.text_snapshot || candidate.text_snapshot,
        updated_at: now,
      })
      .eq("id", candidate.id);

    if (error) {
      throw new Error(error.message);
    }

    if (shouldPromote) {
      promoted += 1;
    } else {
      refreshed += 1;
    }
  }

  return { promoted, refreshed };
}

function shouldUpdateExistingTelegramCandidate(
  candidate: ExistingTelegramCandidateRow,
  nextRow: TelegramCandidateInsertRow,
) {
  if (candidate.status === "ignored") {
    return nextRow.status === "needs_review";
  }

  return candidate.status === "needs_review";
}

function canUpdateExistingTelegramCandidate(
  candidate: ExistingTelegramCandidateRow,
) {
  if (candidate.status !== "ignored" && candidate.status !== "needs_review") {
    return false;
  }

  return !hasProtectedReviewDecision(candidate.review_reason ?? []);
}
