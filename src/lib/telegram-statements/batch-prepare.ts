import "server-only";

import { getStatementSentenceQualityDecision } from "@/lib/statement-quality/extraction-quality";
import { BATCH_ENDPOINT, type PrepareStatementForBatchParams } from "./batch-types";
import { getStatementExtractionMaxAttempts } from "./extraction-config";
import { buildTelegramStatementExtractionRequestBody } from "./extractor";
import {
  getRequiredSupabaseAdminClient,
  getTelegramStatementMessageText,
  markStatementExtractionAttemptStarted,
  markStatementSummaryExtracted,
  markStatementSummaryFailed,
  markStatementSummarySkipped,
} from "./repository";
import { extractTelegramStatementSentenceByRule } from "./rule-extractor";

export async function prepareStatementForBatch({
  dryRun,
  lines,
  model,
  result,
  summary,
}: PrepareStatementForBatchParams) {
  const supabase = getRequiredSupabaseAdminClient();

  if (summary.attempt_count >= getStatementExtractionMaxAttempts()) {
    if (!dryRun) {
      await markStatementSummaryFailed({
        errorMessage: "max_attempts_exceeded",
        summaryId: summary.id,
        supabase,
      });
    }

    result.failed += 1;
    return null;
  }

  const message = await getTelegramStatementMessageText({
    channelUsername: summary.channel_username,
    messageId: summary.message_id,
    supabase,
  });

  if (!message?.text_snapshot.trim()) {
    if (!dryRun) {
      await markStatementSummarySkipped({
        errorMessage: "missing_text_snapshot",
        summaryId: summary.id,
        supabase,
      });
    }

    result.skipped += 1;
    return null;
  }

  const extractionInput = {
    documentTypeHint: summary.document_type,
    organizationName: summary.organization_name,
    sourceUrl: summary.source_url,
    textSnapshot: message.text_snapshot,
  };
  const ruleExtraction = extractTelegramStatementSentenceByRule(extractionInput);

  if (ruleExtraction) {
    const quality = getStatementSentenceQualityDecision({
      confidence: ruleExtraction.confidence,
      coreSentence: ruleExtraction.coreSentence,
      documentType: ruleExtraction.documentType,
      sourceType: "telegram",
    });

    if (!dryRun) {
      await markStatementExtractionAttemptStarted({
        attemptCount: summary.attempt_count,
        summaryId: summary.id,
        supabase,
      });

      if (!quality.publishable) {
        await markStatementSummarySkipped({
          errorMessage: `quality_gate:${quality.reason}`,
          model: ruleExtraction.model,
          promptVersion: ruleExtraction.promptVersion,
          summaryId: summary.id,
          supabase,
        });
        result.skipped += 1;
        return null;
      }

      await markStatementSummaryExtracted({
        confidence: ruleExtraction.confidence,
        coreSentence: ruleExtraction.coreSentence,
        coreSentenceEnd: ruleExtraction.coreSentenceEnd ?? 0,
        coreSentenceStart: ruleExtraction.coreSentenceStart ?? 0,
        documentType: ruleExtraction.documentType,
        model: ruleExtraction.model,
        promptVersion: ruleExtraction.promptVersion,
        reason: ruleExtraction.reason,
        summaryId: summary.id,
        supabase,
      });
    }

    if (quality.publishable) {
      result.ruleExtracted += 1;
    } else {
      result.skipped += 1;
    }
    return null;
  }

  const customId = `summary:${summary.id}`;
  lines.push(
    JSON.stringify({
      body: buildTelegramStatementExtractionRequestBody(extractionInput, model),
      custom_id: customId,
      method: "POST",
      url: BATCH_ENDPOINT,
    }),
  );

  return {
    channelUsername: summary.channel_username,
    customId,
    messageId: summary.message_id,
    organizationName: summary.organization_name,
    summaryId: summary.id,
  };
}
