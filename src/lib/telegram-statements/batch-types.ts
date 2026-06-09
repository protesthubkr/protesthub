import type { PendingStatementSummaryRow } from "./repository";

export const BATCH_ENDPOINT = "/v1/responses";

export type PreparedBatchItem = {
  channelUsername: string;
  customId: string;
  messageId: number;
  organizationName: string;
  summaryId: string;
};

export type TelegramStatementExtractionBatchCreateOptions = {
  dryRun?: boolean;
  limit?: number;
  summaryId?: string;
};

export type TelegramStatementExtractionBatchSyncOptions = {
  importResults?: boolean;
  openaiBatchId: string;
};

export type TelegramStatementExtractionBatchCreateResult = {
  batchId: string | null;
  dryRun: boolean;
  failed: number;
  inputFileId: string | null;
  openaiBatchId: string | null;
  pendingSeen: number;
  queued: PreparedBatchItem[];
  requestsQueued: number;
  ruleExtracted: number;
  skipped: number;
};

export type TelegramStatementExtractionBatchSyncResult = {
  batchId: string | null;
  errorFileId: string | null;
  extracted: number;
  failed: number;
  imported: number;
  importResults: boolean;
  openaiBatchId: string;
  outputFileId: string | null;
  skipped: number;
  status: string;
  unchanged: number;
};

export type PrepareStatementForBatchParams = {
  dryRun: boolean;
  lines: string[];
  model: string;
  result: TelegramStatementExtractionBatchCreateResult;
  summary: PendingStatementSummaryRow;
};
