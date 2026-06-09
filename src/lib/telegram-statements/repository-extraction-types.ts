import type { TelegramStatementDocumentType } from "./types";

export type PendingStatementSummaryRow = {
  attempt_count: number;
  channel_username: string;
  document_type: TelegramStatementDocumentType;
  id: string;
  message_created_at: string | null;
  message_id: number;
  organization_name: string;
  source_url: string;
};

export type StatementSummaryForExtractionRow = PendingStatementSummaryRow & {
  batch_custom_id: string | null;
  batch_id: string | null;
  status: "pending" | "queued" | "extracted" | "skipped" | "failed";
};

export type StatementMessageTextRow = {
  channel_username: string;
  message_id: number;
  text_snapshot: string;
};
