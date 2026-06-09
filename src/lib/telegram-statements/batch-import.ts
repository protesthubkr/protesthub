import "server-only";

import { getStatementSentenceQualityDecision } from "@/lib/statement-quality/extraction-quality";
import { getBatchErrorMessage } from "./batch-errors";
import { getStatementExtractionModel } from "./extraction-config";
import {
  TelegramStatementSentenceNotFoundError,
  buildTelegramStatementExtractionResult,
  parseStatementExtractionOutput,
} from "./extractor";
import {
  getRequiredSupabaseAdminClient,
  getStatementSummaryForExtraction,
  getTelegramStatementMessageText,
  markStatementSummaryExtracted,
  markStatementSummaryFailed,
  markStatementSummarySkipped,
} from "./repository";

type OpenAIBatchResultLine = {
  custom_id?: string;
  error?: unknown;
  response?: {
    body?: unknown;
    status_code?: number;
  };
};

export async function importBatchResultLine(line: string) {
  const supabase = getRequiredSupabaseAdminClient();
  let parsed: OpenAIBatchResultLine;

  try {
    parsed = JSON.parse(line) as OpenAIBatchResultLine;
  } catch {
    return "failed" as const;
  }

  const summaryId = parseSummaryIdFromCustomId(parsed.custom_id);

  if (!summaryId) {
    return "failed" as const;
  }

  const summary = await getStatementSummaryForExtraction({
    summaryId,
    supabase,
  });

  if (!summary || summary.status !== "queued") {
    return "unchanged" as const;
  }

  if (parsed.error || !isSuccessfulStatusCode(parsed.response?.status_code)) {
    await markStatementSummaryFailed({
      errorMessage: parsed.error
        ? `openai_batch_error:${JSON.stringify(parsed.error)}`
        : `openai_batch_request_failed:${parsed.response?.status_code ?? "unknown"}`,
      summaryId,
      supabase,
    });
    return "failed" as const;
  }

  const message = await getTelegramStatementMessageText({
    channelUsername: summary.channel_username,
    messageId: summary.message_id,
    supabase,
  });

  if (!message?.text_snapshot.trim()) {
    await markStatementSummarySkipped({
      errorMessage: "missing_text_snapshot",
      summaryId,
      supabase,
    });
    return "skipped" as const;
  }

  try {
    const output = parseStatementExtractionOutput(parsed.response?.body);
    const extraction = buildTelegramStatementExtractionResult(
      {
        documentTypeHint: summary.document_type,
        organizationName: summary.organization_name,
        sourceUrl: summary.source_url,
        textSnapshot: message.text_snapshot,
      },
      output,
      readResponseModel(parsed.response?.body) ?? getStatementExtractionModel(),
    );

    if (!extraction.isTargetDocument || !extraction.coreSentence.trim()) {
      await markStatementSummarySkipped({
        errorMessage: extraction.reason || "not_target_document",
        model: extraction.model,
        promptVersion: extraction.promptVersion,
        summaryId,
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
        summaryId,
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
      summaryId,
      supabase,
    });
    return "extracted" as const;
  } catch (error) {
    await markStatementSummaryFailed({
      errorMessage: getBatchErrorMessage(error),
      summaryId,
      supabase,
    });
    return "failed" as const;
  }
}

function parseSummaryIdFromCustomId(customId: string | undefined) {
  if (!customId?.startsWith("summary:")) {
    return null;
  }

  const summaryId = customId.slice("summary:".length);

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      summaryId,
    )
  ) {
    return summaryId;
  }

  return null;
}

function isSuccessfulStatusCode(statusCode: number | undefined) {
  return typeof statusCode === "number" && statusCode >= 200 && statusCode < 300;
}

function readResponseModel(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if ("model" in payload && typeof payload.model === "string") {
    return payload.model;
  }

  return null;
}
