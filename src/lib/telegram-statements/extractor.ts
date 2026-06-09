import { getStatementExtractionModel } from "./extraction-config";
import { requestTelegramStatementExtraction } from "./extraction-request";
import { buildTelegramStatementExtractionResult } from "./extraction-result";
import { TelegramStatementExtractionConfigError } from "./extractor-errors";
import type {
  ExtractTelegramStatementSentenceInput,
  TelegramStatementSentenceExtractionResult,
} from "./extractor-types";

export * from "./extraction-output";
export * from "./extraction-request";
export * from "./extraction-result";
export * from "./extractor-errors";
export * from "./extractor-types";
export * from "./sentence-match";

export async function extractTelegramStatementSentence(
  input: ExtractTelegramStatementSentenceInput,
): Promise<TelegramStatementSentenceExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new TelegramStatementExtractionConfigError();
  }

  const model = getStatementExtractionModel();
  const output = await requestTelegramStatementExtraction(input, model, apiKey);

  return buildTelegramStatementExtractionResult(input, output, model);
}
