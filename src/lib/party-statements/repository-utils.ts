import type { TelegramStatementDocumentType } from "@/lib/telegram-statements/types";
import type { PartyStatementSummaryRow } from "./repository-types";

export function normalizeSummaryRow(row: PartyStatementSummaryRow) {
  return {
    ...row,
    document_type: normalizeDocumentType(row.document_type),
    source_key: row.source_key,
  };
}

export function normalizeDocumentType(value: string): TelegramStatementDocumentType {
  if (
    value === "statement" ||
    value === "commentary" ||
    value === "position" ||
    value === "press_release" ||
    value === "press_conference" ||
    value === "condemnation" ||
    value === "welcome"
  ) {
    return value;
  }

  return "position";
}
