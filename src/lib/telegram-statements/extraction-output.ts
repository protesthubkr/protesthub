import type { StatementExtractionModelOutput } from "./extractor-types";
import { normalizeConfidence } from "./sentence-match";

export function parseStatementExtractionOutput(payload: unknown) {
  const text = readOutputText(payload);

  if (!text) {
    throw new Error("Statement extraction returned no output text.");
  }

  return sanitizeStatementExtractionOutput(
    JSON.parse(text) as StatementExtractionModelOutput,
  );
}

function sanitizeStatementExtractionOutput(output: StatementExtractionModelOutput) {
  return {
    confidence: normalizeConfidence(output.confidence),
    core_sentence:
      typeof output.core_sentence === "string" ? output.core_sentence.trim() : "",
    document_type: output.document_type,
    is_target_document: Boolean(output.is_target_document),
    reason: typeof output.reason === "string" ? output.reason.trim() : "",
  } satisfies StatementExtractionModelOutput;
}

function readOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return [];
      }

      const content = item.content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => {
        if (!part || typeof part !== "object") {
          return [];
        }

        if ("text" in part && typeof part.text === "string") {
          return [part.text];
        }

        return [];
      });
    })
    .join("")
    .trim();
}
