import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getStatementSentenceQualityDecision,
  type StatementQualitySourceType,
} from "./extraction-quality";

type QualityReviewSourceFilter = "all" | StatementQualitySourceType;

type QualityReviewRow = {
  core_sentence: string | null;
  document_type: string | null;
  extraction_confidence: number | null;
  id: string;
  organization_name: string;
  source_url: string;
};

type TelegramQualityReviewRow = QualityReviewRow & {
  message_created_at: string | null;
};

type PartyQualityReviewRow = QualityReviewRow & {
  published_at: string | null;
};

export type StatementQualityReviewOptions = {
  dryRun?: boolean;
  limit?: number;
  source?: QualityReviewSourceFilter;
  windowHours?: number;
};

export type StatementQualityReviewOutcome = {
  action: "kept" | "skipped";
  coreSentence: string;
  id: string;
  organizationName: string;
  reason: string;
  sourceType: StatementQualitySourceType;
  sourceUrl: string;
};

export type StatementQualityReviewSourceResult = {
  kept: number;
  outcomes: StatementQualityReviewOutcome[];
  seen: number;
  skipped: number;
};

export type StatementQualityReviewResult = {
  cutoffIso: string;
  dryRun: boolean;
  limit: number;
  party: StatementQualityReviewSourceResult | null;
  source: QualityReviewSourceFilter;
  telegram: StatementQualityReviewSourceResult | null;
  windowHours: number;
};

const DEFAULT_WINDOW_HOURS = 48;
const DEFAULT_LIMIT = 500;

export async function runStatementQualityReview(
  options: StatementQualityReviewOptions = {},
): Promise<StatementQualityReviewResult> {
  const supabase = getRequiredQualityReviewSupabaseClient();
  const dryRun = options.dryRun ?? true;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const source = options.source ?? "all";
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  const cutoffIso = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  return {
    cutoffIso,
    dryRun,
    limit,
    party:
      source === "all" || source === "party"
        ? await reviewPartyStatements({ cutoffIso, dryRun, limit, supabase })
        : null,
    source,
    telegram:
      source === "all" || source === "telegram"
        ? await reviewTelegramStatements({ cutoffIso, dryRun, limit, supabase })
        : null,
    windowHours,
  };
}

function getRequiredQualityReviewSupabaseClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

async function reviewTelegramStatements({
  cutoffIso,
  dryRun,
  limit,
  supabase,
}: {
  cutoffIso: string;
  dryRun: boolean;
  limit: number;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("telegram_statement_summaries")
    .select(
      [
        "id",
        "organization_name",
        "source_url",
        "message_created_at",
        "document_type",
        "core_sentence",
        "extraction_confidence",
      ].join(","),
    )
    .eq("status", "extracted")
    .gte("message_created_at", cutoffIso)
    .order("message_created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return reviewRows({
    dryRun,
    rows: (data as unknown as TelegramQualityReviewRow[] | null) ?? [],
    sourceType: "telegram",
    supabase,
    table: "telegram_statement_summaries",
  });
}

async function reviewPartyStatements({
  cutoffIso,
  dryRun,
  limit,
  supabase,
}: {
  cutoffIso: string;
  dryRun: boolean;
  limit: number;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("party_statement_summaries")
    .select(
      [
        "id",
        "organization_name",
        "source_url",
        "published_at",
        "document_type",
        "core_sentence",
        "extraction_confidence",
      ].join(","),
    )
    .eq("status", "extracted")
    .gte("published_at", cutoffIso)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return reviewRows({
    dryRun,
    rows: (data as unknown as PartyQualityReviewRow[] | null) ?? [],
    sourceType: "party",
    supabase,
    table: "party_statement_summaries",
  });
}

async function reviewRows({
  dryRun,
  rows,
  sourceType,
  supabase,
  table,
}: {
  dryRun: boolean;
  rows: QualityReviewRow[];
  sourceType: StatementQualitySourceType;
  supabase: SupabaseClient;
  table: "party_statement_summaries" | "telegram_statement_summaries";
}): Promise<StatementQualityReviewSourceResult> {
  const result: StatementQualityReviewSourceResult = {
    kept: 0,
    outcomes: [],
    seen: rows.length,
    skipped: 0,
  };

  for (const row of rows) {
    const decision = getStatementSentenceQualityDecision({
      confidence: row.extraction_confidence,
      coreSentence: row.core_sentence,
      documentType: row.document_type,
      sourceType,
    });
    const action = decision.publishable ? "kept" : "skipped";

    if (decision.publishable) {
      result.kept += 1;
    } else {
      result.skipped += 1;

      if (!dryRun) {
        await markExtractedRowSkipped({
          reason: decision.reason,
          rowId: row.id,
          supabase,
          table,
        });
      }
    }

    result.outcomes.push({
      action,
      coreSentence: row.core_sentence?.trim() ?? "",
      id: row.id,
      organizationName: row.organization_name,
      reason: decision.reason,
      sourceType,
      sourceUrl: row.source_url,
    });
  }

  return result;
}

async function markExtractedRowSkipped({
  reason,
  rowId,
  supabase,
  table,
}: {
  reason: string;
  rowId: string;
  supabase: SupabaseClient;
  table: "party_statement_summaries" | "telegram_statement_summaries";
}) {
  const { error } = await supabase
    .from(table)
    .update({
      last_error: `quality_gate:${reason}`,
      status: "skipped",
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId)
    .eq("status", "extracted");

  if (error) {
    throw new Error(error.message);
  }
}
