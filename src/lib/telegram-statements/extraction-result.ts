import { TELEGRAM_STATEMENT_EXTRACTION_PROMPT_VERSION } from "./extraction-schema";
import { TelegramStatementSentenceNotFoundError } from "./extractor-errors";
import type {
  ExtractTelegramStatementSentenceInput,
  StatementExtractionModelOutput,
  TelegramStatementSentenceExtractionResult,
} from "./extractor-types";
import { findSentenceInSource, normalizeConfidence } from "./sentence-match";

export function buildTelegramStatementExtractionResult(
  input: ExtractTelegramStatementSentenceInput,
  output: StatementExtractionModelOutput,
  model: string,
): TelegramStatementSentenceExtractionResult {
  const coreSentence = output.core_sentence.trim();

  if (!output.is_target_document || !coreSentence) {
    return {
      confidence: normalizeConfidence(output.confidence),
      coreSentence: "",
      coreSentenceEnd: null,
      coreSentenceStart: null,
      documentType: output.document_type,
      isTargetDocument: false,
      model,
      promptVersion: TELEGRAM_STATEMENT_EXTRACTION_PROMPT_VERSION,
      reason: output.reason.trim(),
    };
  }

  const match = findSentenceInSource(input.textSnapshot, coreSentence);

  if (!match) {
    throw new TelegramStatementSentenceNotFoundError(coreSentence);
  }

  return {
    confidence: normalizeConfidence(output.confidence),
    coreSentence: match.sentence,
    coreSentenceEnd: match.end,
    coreSentenceStart: match.start,
    documentType: output.document_type,
    isTargetDocument: true,
    model,
    promptVersion: TELEGRAM_STATEMENT_EXTRACTION_PROMPT_VERSION,
    reason: output.reason.trim(),
  };
}
