import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramStatementDocumentType } from "./types";

export async function markStatementExtractionAttemptStarted({
  attemptCount,
  summaryId,
  supabase,
}: {
  attemptCount: number;
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("telegram_statement_summaries")
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

export async function markStatementSummaryQueuedForBatch({
  attemptCount,
  batchId,
  customId,
  model,
  promptVersion,
  summaryId,
  supabase,
}: {
  attemptCount: number;
  batchId: string;
  customId: string;
  model: string;
  promptVersion: string;
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("telegram_statement_summaries")
    .update({
      attempt_count: attemptCount + 1,
      batch_custom_id: customId,
      batch_id: batchId,
      last_error: null,
      model,
      prompt_version: promptVersion,
      status: "queued",
      updated_at: new Date().toISOString(),
    })
    .eq("id", summaryId)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }
}

export async function markStatementSummaryExtracted({
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
    .from("telegram_statement_summaries")
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

export async function markStatementSummarySkipped({
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
    .from("telegram_statement_summaries")
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

export async function markStatementSummaryFailed({
  errorMessage,
  summaryId,
  supabase,
}: {
  errorMessage: string;
  summaryId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("telegram_statement_summaries")
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
