import { getReasoningRequestOptions } from "@/lib/llm/structured-event-config";
import {
  getStatementExtractionInputChars,
  getStatementExtractionMaxOutputTokens,
  getStatementPromptCacheKey,
  getStatementPromptCacheRetention,
} from "./extraction-config";
import { buildTelegramStatementExtractionPrompt } from "./extraction-prompt";
import {
  TELEGRAM_STATEMENT_EXTRACTION_SCHEMA,
} from "./extraction-schema";
import { TelegramStatementExtractionRequestError } from "./extractor-errors";
import type { ExtractTelegramStatementSentenceInput } from "./extractor-types";
import { parseStatementExtractionOutput } from "./extraction-output";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export function buildTelegramStatementExtractionRequestBody(
  input: ExtractTelegramStatementSentenceInput,
  model: string,
) {
  const promptCacheKey = getStatementPromptCacheKey();
  const promptCacheRetention = getStatementPromptCacheRetention();
  const modelInput = {
    ...input,
    textSnapshot: truncateStatementTextForModel(input.textSnapshot),
  };

  return {
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildTelegramStatementExtractionPrompt(modelInput),
          },
        ],
      },
    ],
    max_output_tokens: getStatementExtractionMaxOutputTokens(),
    text: {
      format: {
        type: "json_schema",
        name: "telegram_statement_sentence_extraction",
        strict: true,
        schema: TELEGRAM_STATEMENT_EXTRACTION_SCHEMA,
      },
    },
    ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
    ...(promptCacheRetention
      ? { prompt_cache_retention: promptCacheRetention }
      : {}),
    ...getReasoningRequestOptions(model),
  };
}

export async function requestTelegramStatementExtraction(
  input: ExtractTelegramStatementSentenceInput,
  model: string,
  apiKey: string,
) {
  const body = buildTelegramStatementExtractionRequestBody(input, model);

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new TelegramStatementExtractionRequestError(response.status, payload);
  }

  return parseStatementExtractionOutput(payload);
}

function truncateStatementTextForModel(textSnapshot: string) {
  const maxChars = getStatementExtractionInputChars();

  if (textSnapshot.length <= maxChars) {
    return textSnapshot;
  }

  return textSnapshot.slice(0, maxChars).trimEnd();
}

async function readJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
