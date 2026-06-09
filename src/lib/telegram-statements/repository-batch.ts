import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type StatementExtractionBatchRow = {
  completed_at: string | null;
  error_file_id: string | null;
  error_message: string | null;
  id: string;
  input_file_id: string | null;
  openai_batch_id: string | null;
  output_file_id: string | null;
  request_count: number;
  status: string;
};

export async function createStatementExtractionBatchRecord({
  metadata,
  requestCount,
  ruleExtractedCount,
  skippedCount,
  supabase,
}: {
  metadata: Record<string, unknown>;
  requestCount: number;
  ruleExtractedCount: number;
  skippedCount: number;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("telegram_statement_extraction_batches")
    .insert({
      metadata,
      request_count: requestCount,
      rule_extracted_count: ruleExtractedCount,
      skipped_count: skippedCount,
      status: "preparing",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      error?.message ?? "Failed to create statement extraction batch.",
    );
  }

  return data.id as string;
}

export async function markStatementExtractionBatchSubmitted({
  batchId,
  inputFileId,
  openaiBatchId,
  requestCount,
  supabase,
}: {
  batchId: string;
  inputFileId: string;
  openaiBatchId: string;
  requestCount: number;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("telegram_statement_extraction_batches")
    .update({
      input_file_id: inputFileId,
      openai_batch_id: openaiBatchId,
      request_count: requestCount,
      status: "submitted",
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", batchId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markStatementExtractionBatchFailed({
  batchId,
  errorMessage,
  supabase,
}: {
  batchId: string;
  errorMessage: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("telegram_statement_extraction_batches")
    .update({
      error_message: errorMessage,
      status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getStatementExtractionBatchByOpenAIId({
  openaiBatchId,
  supabase,
}: {
  openaiBatchId: string;
  supabase: SupabaseClient;
}) {
  const { data, error } = await supabase
    .from("telegram_statement_extraction_batches")
    .select(
      [
        "id",
        "openai_batch_id",
        "input_file_id",
        "output_file_id",
        "error_file_id",
        "request_count",
        "status",
        "error_message",
        "completed_at",
      ].join(","),
    )
    .eq("openai_batch_id", openaiBatchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as StatementExtractionBatchRow | null;
}

export async function updateStatementExtractionBatchFromOpenAI({
  completedAt,
  errorFileId,
  errorMessage,
  openaiBatchId,
  outputFileId,
  status,
  supabase,
}: {
  completedAt?: string | null;
  errorFileId?: string | null;
  errorMessage?: string | null;
  openaiBatchId: string;
  outputFileId?: string | null;
  status: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("telegram_statement_extraction_batches")
    .update({
      completed_at: completedAt ?? null,
      error_file_id: errorFileId ?? null,
      error_message: errorMessage ?? null,
      output_file_id: outputFileId ?? null,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("openai_batch_id", openaiBatchId);

  if (error) {
    throw new Error(error.message);
  }
}
