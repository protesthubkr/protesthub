import type { TelegramStatementDocumentType } from "./types";

export function normalizeStatementDocumentType(
  value: string,
): TelegramStatementDocumentType {
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
