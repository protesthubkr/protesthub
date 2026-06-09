import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramStatementDocumentType } from "@/lib/telegram-statements/types";
import { normalizeSummaryRow } from "./repository-utils";
import type { PartyStatementSummaryRow } from "./repository-types";
import type { PartyStatementDocument } from "./types";

const SUMMARY_SELECT = [
  "id",
  "document_id",
  "source_key",
  "organization_name",
  "source_url",
  "title",
  "published_at",
  "document_type",
  "status",
  "attempt_count",
].join(",");

export async function upsertPartyStatementSummaryCandidate({
  document,
  documentId,
  supabase,
}: {
  document: PartyStatementDocument;
  documentId: string;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("party_statement_summaries")
    .upsert(
      {
        document_id: documentId,
        document_type: document.documentType,
        organization_name: document.organizationName,
        published_at: document.publishedAt,
        source_key: document.sourceKey,
        source_url: document.sourceUrl,
        title: document.title,
        updated_at: now,
      },
      {
        ignoreDuplicates: true,
        onConflict: "document_id",
      },
    )
    .select(SUMMARY_SELECT)
    .single();

  if (!error && data) {
    return normalizeSummaryRow(data as unknown as PartyStatementSummaryRow);
  }

  const { data: existing, error: existingError } = await supabase
    .from("party_statement_summaries")
    .select(SUMMARY_SELECT)
    .eq("document_id", documentId)
    .single();

  if (existingError || !existing) {
    throw new Error(
      existingError?.message ?? "Failed to upsert party statement summary.",
    );
  }

  return normalizeSummaryRow(existing as unknown as PartyStatementSummaryRow);
}

export async function markPartyStatementExtractionAttemptStarted({
  attemptCount,
  summaryId,
  supabase,
}: {
  attemptCount: number;
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("party_statement_summaries")
    .update({
      attempt_count: attemptCount + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", summaryId)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPartyStatementSummaryExtracted({
  confidence,
  coreSentence,
  coreSentenceEnd,
  coreSentenceStart,
  documentType,
  model,
  promptVersion,
  reason,
  summaryId,
  supabase,
}: {
  confidence: number;
  coreSentence: string;
  coreSentenceEnd: number;
  coreSentenceStart: number;
  documentType: TelegramStatementDocumentType;
  model: string;
  promptVersion: string;
  reason: string;
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("party_statement_summaries")
    .update({
      core_sentence: coreSentence,
      core_sentence_end: coreSentenceEnd,
      core_sentence_start: coreSentenceStart,
      document_type: documentType,
      extracted_at: now,
      extraction_confidence: confidence,
      extraction_reason: reason,
      last_error: null,
      model,
      prompt_version: promptVersion,
      status: "extracted",
      updated_at: now,
    })
    .eq("id", summaryId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPartyStatementSummarySkipped({
  errorMessage,
  model,
  promptVersion,
  summaryId,
  supabase,
}: {
  errorMessage: string;
  model?: string;
  promptVersion?: string;
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("party_statement_summaries")
    .update({
      extracted_at: now,
      last_error: errorMessage,
      model: model ?? null,
      prompt_version: promptVersion ?? null,
      status: "skipped",
      updated_at: now,
    })
    .eq("id", summaryId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markPartyStatementSummaryFailed({
  errorMessage,
  summaryId,
  supabase,
}: {
  errorMessage: string;
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("party_statement_summaries")
    .update({
      last_error: errorMessage,
      status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", summaryId);

  if (error) {
    throw new Error(error.message);
  }
}
