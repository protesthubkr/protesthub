import "server-only";

import { getBatchErrorMessage } from "./batch-errors";
import { importBatchResultLine } from "./batch-import";
import {
  createOpenAIResponsesBatch,
  downloadOpenAIFileContent,
  retrieveOpenAIBatch,
  uploadOpenAIBatchFile,
} from "./batch-openai";
import { prepareStatementForBatch } from "./batch-prepare";
import {
  BATCH_ENDPOINT,
  type TelegramStatementExtractionBatchCreateOptions,
  type TelegramStatementExtractionBatchCreateResult,
  type TelegramStatementExtractionBatchSyncOptions,
  type TelegramStatementExtractionBatchSyncResult,
} from "./batch-types";
import { getStatementExtractionModel } from "./extraction-config";
import { TELEGRAM_STATEMENT_EXTRACTION_PROMPT_VERSION } from "./extraction-schema";
import { TelegramStatementExtractionConfigError } from "./extractor";
import {
  createStatementExtractionBatchRecord,
  getPendingStatementSummaries,
  getRequiredSupabaseAdminClient,
  getStatementExtractionBatchByOpenAIId,
  markStatementExtractionBatchFailed,
  markStatementExtractionBatchSubmitted,
  markStatementSummaryQueuedForBatch,
  updateStatementExtractionBatchFromOpenAI,
} from "./repository";

export type {
  TelegramStatementExtractionBatchCreateOptions,
  TelegramStatementExtractionBatchCreateResult,
  TelegramStatementExtractionBatchSyncOptions,
  TelegramStatementExtractionBatchSyncResult,
} from "./batch-types";

export async function createTelegramStatementExtractionBatch(
  options: TelegramStatementExtractionBatchCreateOptions = {},
): Promise<TelegramStatementExtractionBatchCreateResult> {
  const supabase = getRequiredSupabaseAdminClient();
  const dryRun = options.dryRun ?? false;
  const limit = options.limit ?? 200;
  const pendingRows = await getPendingStatementSummaries({
    limit,
    summaryId: options.summaryId,
    supabase,
  });
  const model = getStatementExtractionModel();
  const result: TelegramStatementExtractionBatchCreateResult = {
    batchId: null,
    dryRun,
    failed: 0,
    inputFileId: null,
    openaiBatchId: null,
    pendingSeen: pendingRows.length,
    queued: [],
    requestsQueued: 0,
    ruleExtracted: 0,
    skipped: 0,
  };
  const lines: string[] = [];

  for (const summary of pendingRows) {
    const prepared = await prepareStatementForBatch({
      dryRun,
      lines,
      model,
      result,
      summary,
    });

    if (prepared) {
      result.queued.push(prepared);
    }
  }

  result.requestsQueued = lines.length;

  if (dryRun || lines.length === 0) {
    return result;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new TelegramStatementExtractionConfigError();
  }

  const batchId = await createStatementExtractionBatchRecord({
    metadata: {
      endpoint: BATCH_ENDPOINT,
      model,
      promptVersion: TELEGRAM_STATEMENT_EXTRACTION_PROMPT_VERSION,
      source: "telegram_statement_extraction_batch",
    },
    requestCount: lines.length,
    ruleExtractedCount: result.ruleExtracted,
    skippedCount: result.skipped,
    supabase,
  });
  result.batchId = batchId;

  try {
    const inputFile = await uploadOpenAIBatchFile({
      apiKey,
      jsonl: lines.join("\n"),
    });
    const batch = await createOpenAIResponsesBatch({
      apiKey,
      inputFileId: inputFile.id,
    });

    await markStatementExtractionBatchSubmitted({
      batchId,
      inputFileId: inputFile.id,
      openaiBatchId: batch.id,
      requestCount: lines.length,
      supabase,
    });

    for (const item of result.queued) {
      await markStatementSummaryQueuedForBatch({
        attemptCount:
          pendingRows.find((summary) => summary.id === item.summaryId)
            ?.attempt_count ?? 0,
        batchId,
        customId: item.customId,
        model,
        promptVersion: TELEGRAM_STATEMENT_EXTRACTION_PROMPT_VERSION,
        summaryId: item.summaryId,
        supabase,
      });
    }

    result.inputFileId = inputFile.id;
    result.openaiBatchId = batch.id;
    return result;
  } catch (error) {
    await markStatementExtractionBatchFailed({
      batchId,
      errorMessage: getBatchErrorMessage(error),
      supabase,
    });
    throw error;
  }
}

export async function syncTelegramStatementExtractionBatch(
  options: TelegramStatementExtractionBatchSyncOptions,
): Promise<TelegramStatementExtractionBatchSyncResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new TelegramStatementExtractionConfigError();
  }

  const supabase = getRequiredSupabaseAdminClient();
  const openaiBatch = await retrieveOpenAIBatch({
    apiKey,
    openaiBatchId: options.openaiBatchId,
  });
  const completedAt = openaiBatch.completed_at
    ? new Date(openaiBatch.completed_at * 1000).toISOString()
    : null;

  await updateStatementExtractionBatchFromOpenAI({
    completedAt,
    errorFileId: openaiBatch.error_file_id ?? null,
    errorMessage: openaiBatch.errors ? JSON.stringify(openaiBatch.errors) : null,
    openaiBatchId: openaiBatch.id,
    outputFileId: openaiBatch.output_file_id ?? null,
    status: openaiBatch.status,
    supabase,
  });

  const localBatch = await getStatementExtractionBatchByOpenAIId({
    openaiBatchId: openaiBatch.id,
    supabase,
  });
  const result: TelegramStatementExtractionBatchSyncResult = {
    batchId: localBatch?.id ?? null,
    errorFileId: openaiBatch.error_file_id ?? null,
    extracted: 0,
    failed: 0,
    imported: 0,
    importResults: options.importResults ?? false,
    openaiBatchId: openaiBatch.id,
    outputFileId: openaiBatch.output_file_id ?? null,
    skipped: 0,
    status: openaiBatch.status,
    unchanged: 0,
  };

  if (!options.importResults || !openaiBatch.output_file_id) {
    return result;
  }

  const content = await downloadOpenAIFileContent({
    apiKey,
    fileId: openaiBatch.output_file_id,
  });

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const imported = await importBatchResultLine(trimmed);
    result.imported += 1;

    if (imported === "extracted") {
      result.extracted += 1;
    } else if (imported === "skipped") {
      result.skipped += 1;
    } else if (imported === "failed") {
      result.failed += 1;
    } else {
      result.unchanged += 1;
    }
  }

  return result;
}
