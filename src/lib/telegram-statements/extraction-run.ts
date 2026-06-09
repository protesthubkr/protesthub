import "server-only";

import {
  getStatementExtractionLimit,
  getStatementExtractionMaxAttempts,
} from "./extraction-config";
import {
  TelegramStatementExtractionConfigError,
  TelegramStatementExtractionRequestError,
  TelegramStatementSentenceNotFoundError,
  extractTelegramStatementSentence,
} from "./extractor";
import { extractTelegramStatementSentenceByRule } from "./rule-extractor";
import { getStatementSentenceQualityDecision } from "@/lib/statement-quality/extraction-quality";
import {
  getPendingStatementSummaries,
  getRequiredSupabaseAdminClient,
  getTelegramStatementMessageText,
  markStatementExtractionAttemptStarted,
  markStatementSummaryExtracted,
  markStatementSummaryFailed,
  markStatementSummarySkipped,
  type PendingStatementSummaryRow,
} from "./repository";

export type TelegramStatementExtractionRunOptions = {
  dryRun?: boolean;
  limit?: number;
  summaryId?: string;
  windowHours?: number;
};

export type TelegramStatementExtractionOutcome = {
  channelUsername: string;
  messageId: number;
  organizationName: string;
  status: "pending" | "extracted" | "skipped" | "failed";
  summaryId: string;
};

export type TelegramStatementExtractionRunResult = {
  cutoffIso: string | null;
  dryRun: boolean;
  extracted: number;
  failed: number;
  outcomes: TelegramStatementExtractionOutcome[];
  pendingSeen: number;
  skipped: number;
};

export async function runTelegramStatementExtractions(
  options: TelegramStatementExtractionRunOptions = {},
): Promise<TelegramStatementExtractionRunResult> {
  const supabase = getRequiredSupabaseAdminClient();
  const dryRun = options.dryRun ?? false;
  const limit = options.limit ?? getStatementExtractionLimit();
  const cutoffIso = options.windowHours
    ? new Date(Date.now() - options.windowHours * 60 * 60 * 1000).toISOString()
    : null;
  const pendingRows = await getPendingStatementSummaries({
    createdAfterIso: cutoffIso,
    limit,
    summaryId: options.summaryId,
    supabase,
  });
  const result: TelegramStatementExtractionRunResult = {
    cutoffIso,
    dryRun,
    extracted: 0,
    failed: 0,
    outcomes: [],
    pendingSeen: pendingRows.length,
    skipped: 0,
  };

  for (const summary of pendingRows) {
    if (dryRun) {
      result.outcomes.push(toOutcome(summary, "pending"));
      continue;
    }

    const status = await processPendingStatementSummary(summary);
    result.outcomes.push(toOutcome(summary, status));

    if (status === "extracted") {
      result.extracted += 1;
    } else if (status === "skipped") {
      result.skipped += 1;
    } else if (status === "failed") {
      result.failed += 1;
    }
  }

  return result;
}

async function processPendingStatementSummary(
  summary: PendingStatementSummaryRow,
) {
  const supabase = getRequiredSupabaseAdminClient();

  if (summary.attempt_count >= getStatementExtractionMaxAttempts()) {
    await markStatementSummaryFailed({
      errorMessage: "max_attempts_exceeded",
      summaryId: summary.id,
      supabase,
    });
    return "failed" as const;
  }

  await markStatementExtractionAttemptStarted({
    attemptCount: summary.attempt_count,
    summaryId: summary.id,
    supabase,
  });

  const message = await getTelegramStatementMessageText({
    channelUsername: summary.channel_username,
    messageId: summary.message_id,
    supabase,
  });

  if (!message?.text_snapshot.trim()) {
    await markStatementSummarySkipped({
      errorMessage: "missing_text_snapshot",
      summaryId: summary.id,
      supabase,
    });
    return "skipped" as const;
  }

  try {
    const extractionInput = {
      documentTypeHint: summary.document_type,
      organizationName: summary.organization_name,
      sourceUrl: summary.source_url,
      textSnapshot: message.text_snapshot,
    };
    const extraction =
      extractTelegramStatementSentenceByRule(extractionInput) ??
      (await extractTelegramStatementSentence(extractionInput));

    if (!extraction.isTargetDocument || !extraction.coreSentence.trim()) {
      await markStatementSummarySkipped({
        errorMessage: extraction.reason || "not_target_document",
        model: extraction.model,
        promptVersion: extraction.promptVersion,
        summaryId: summary.id,
        supabase,
      });
      return "skipped" as const;
    }

    const quality = getStatementSentenceQualityDecision({
      confidence: extraction.confidence,
      coreSentence: extraction.coreSentence,
      documentType: extraction.documentType,
      sourceType: "telegram",
    });

    if (!quality.publishable) {
      await markStatementSummarySkipped({
        errorMessage: `quality_gate:${quality.reason}`,
        model: extraction.model,
        promptVersion: extraction.promptVersion,
        summaryId: summary.id,
        supabase,
      });
      return "skipped" as const;
    }

    if (
      extraction.coreSentenceStart === null ||
      extraction.coreSentenceEnd === null
    ) {
      throw new TelegramStatementSentenceNotFoundError(
        extraction.coreSentence,
      );
    }

    await markStatementSummaryExtracted({
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

    return "extracted" as const;
  } catch (error) {
    await markStatementSummaryFailed({
      errorMessage: getExtractionErrorMessage(error),
      summaryId: summary.id,
      supabase,
    });
    return "failed" as const;
  }
}

function toOutcome(
  summary: PendingStatementSummaryRow,
  status: TelegramStatementExtractionOutcome["status"],
): TelegramStatementExtractionOutcome {
  return {
    channelUsername: summary.channel_username,
    messageId: summary.message_id,
    organizationName: summary.organization_name,
    status,
    summaryId: summary.id,
  };
}

function getExtractionErrorMessage(error: unknown) {
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
