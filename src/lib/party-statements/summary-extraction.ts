import "server-only";

import { getStatementSentenceQualityDecision } from "@/lib/statement-quality/extraction-quality";
import { getStatementExtractionMaxAttempts } from "@/lib/telegram-statements/extraction-config";
import {
  extractTelegramStatementSentence,
  TelegramStatementExtractionConfigError,
  TelegramStatementExtractionRequestError,
  TelegramStatementSentenceNotFoundError,
} from "@/lib/telegram-statements/extractor";
import { extractTelegramStatementSentenceByRule } from "@/lib/telegram-statements/rule-extractor";
import {
  getPartyStatementDocumentText,
  getRequiredPartyStatementSupabaseClient,
  markPartyStatementExtractionAttemptStarted,
  markPartyStatementSummaryExtracted,
  markPartyStatementSummaryFailed,
  markPartyStatementSummarySkipped,
  type PartyStatementSummaryRow,
} from "./repository";
import type { PartyStatementExtractionStatus } from "./run-types";

export async function processPartyStatementSummary(
  summary: PartyStatementSummaryRow,
): Promise<PartyStatementExtractionStatus> {
  const supabase = getRequiredPartyStatementSupabaseClient();

  if (summary.attempt_count >= getStatementExtractionMaxAttempts()) {
    await markPartyStatementSummaryFailed({
      errorMessage: "max_attempts_exceeded",
      summaryId: summary.id,
      supabase,
    });
    return "failed";
  }

  await markPartyStatementExtractionAttemptStarted({
    attemptCount: summary.attempt_count,
    summaryId: summary.id,
    supabase,
  });

  const textSnapshot = await getPartyStatementDocumentText({
    documentId: summary.document_id,
    supabase,
  });

  if (!textSnapshot.trim()) {
    await markPartyStatementSummarySkipped({
      errorMessage: "missing_text_snapshot",
      summaryId: summary.id,
      supabase,
    });
    return "skipped";
  }

  try {
    const extractionInput = {
      documentTypeHint: summary.document_type,
      organizationName: summary.organization_name,
      sourceUrl: summary.source_url,
      textSnapshot,
    };
    const extraction =
      extractTelegramStatementSentenceByRule(extractionInput) ??
      (await extractTelegramStatementSentence(extractionInput));

    if (!extraction.isTargetDocument || !extraction.coreSentence.trim()) {
      await markPartyStatementSummarySkipped({
        errorMessage: extraction.reason || "not_target_document",
        model: extraction.model,
        promptVersion: extraction.promptVersion,
        summaryId: summary.id,
        supabase,
      });
      return "skipped";
    }

    const quality = getStatementSentenceQualityDecision({
      confidence: extraction.confidence,
      coreSentence: extraction.coreSentence,
      documentType: extraction.documentType,
      sourceType: "party",
    });

    if (!quality.publishable) {
      await markPartyStatementSummarySkipped({
        errorMessage: `quality_gate:${quality.reason}`,
        model: extraction.model,
        promptVersion: extraction.promptVersion,
        summaryId: summary.id,
        supabase,
      });
      return "skipped";
    }

    if (
      extraction.coreSentenceStart === null ||
      extraction.coreSentenceEnd === null
    ) {
      throw new TelegramStatementSentenceNotFoundError(
        extraction.coreSentence,
      );
    }

    await markPartyStatementSummaryExtracted({
      confidence: extraction.confidence,
      coreSentence: extraction.coreSentence,
      coreSentenceEnd: extraction.coreSentenceEnd,
      coreSentenceStart: extraction.coreSentenceStart,
      documentType: extraction.documentType,
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      reason: extraction.reason,
      summaryId: summary.id,
      supabase,
    });
    return "extracted";
  } catch (error) {
    await markPartyStatementSummaryFailed({
      errorMessage: getPartyStatementErrorMessage(error),
      summaryId: summary.id,
      supabase,
    });
    return "failed";
  }
}

export function getPartyStatementErrorMessage(error: unknown) {
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
