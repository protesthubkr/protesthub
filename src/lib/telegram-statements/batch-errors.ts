import "server-only";

import {
  TelegramStatementExtractionConfigError,
  TelegramStatementExtractionRequestError,
  TelegramStatementSentenceNotFoundError,
} from "./extractor";

export function getBatchErrorMessage(error: unknown) {
  if (error instanceof TelegramStatementExtractionConfigError) {
    return "missing_openai_api_key";
  }

  if (error instanceof TelegramStatementSentenceNotFoundError) {
    return "core_sentence_not_found";
  }

  if (error instanceof TelegramStatementExtractionRequestError) {
    return `openai_request_failed:${error.status}`;
  }

  return error instanceof Error ? error.message : String(error);
}
