import "server-only";

import { BATCH_ENDPOINT } from "./batch-types";
import { TelegramStatementExtractionRequestError } from "./extractor";

const OPENAI_FILES_URL = "https://api.openai.com/v1/files";
const OPENAI_BATCHES_URL = "https://api.openai.com/v1/batches";

type OpenAIFileResponse = {
  id: string;
};

export type OpenAIBatchResponse = {
  completed_at?: number | null;
  error_file_id?: string | null;
  errors?: unknown;
  id: string;
  input_file_id?: string | null;
  output_file_id?: string | null;
  status: string;
};

export async function uploadOpenAIBatchFile({
  apiKey,
  jsonl,
}: {
  apiKey: string;
  jsonl: string;
}) {
  const formData = new FormData();
  formData.append("purpose", "batch");
  formData.append(
    "file",
    new Blob([jsonl], { type: "application/jsonl" }),
    "telegram-statement-extractions.jsonl",
  );

  const response = await fetch(OPENAI_FILES_URL, {
    body: formData,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    method: "POST",
  });
  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new TelegramStatementExtractionRequestError(response.status, payload);
  }

  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    throw new Error("OpenAI file upload returned no file id.");
  }

  return payload as OpenAIFileResponse;
}

export async function createOpenAIResponsesBatch({
  apiKey,
  inputFileId,
}: {
  apiKey: string;
  inputFileId: string;
}) {
  const response = await fetch(OPENAI_BATCHES_URL, {
    body: JSON.stringify({
      completion_window: "24h",
      endpoint: BATCH_ENDPOINT,
      input_file_id: inputFileId,
      metadata: {
        source: "telegram_statement_extractions",
      },
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new TelegramStatementExtractionRequestError(response.status, payload);
  }

  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    throw new Error("OpenAI batch creation returned no batch id.");
  }

  return payload as OpenAIBatchResponse;
}

export async function retrieveOpenAIBatch({
  apiKey,
  openaiBatchId,
}: {
  apiKey: string;
  openaiBatchId: string;
}) {
  const response = await fetch(`${OPENAI_BATCHES_URL}/${openaiBatchId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new TelegramStatementExtractionRequestError(response.status, payload);
  }

  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    throw new Error("OpenAI batch retrieval returned no batch id.");
  }

  return payload as OpenAIBatchResponse;
}

export async function downloadOpenAIFileContent({
  apiKey,
  fileId,
}: {
  apiKey: string;
  fileId: string;
}) {
  const response = await fetch(`${OPENAI_FILES_URL}/${fileId}/content`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const payload = await readJsonSafely(response);
    throw new TelegramStatementExtractionRequestError(response.status, payload);
  }

  return response.text();
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
