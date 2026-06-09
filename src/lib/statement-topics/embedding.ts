import "server-only";

import { createHash } from "crypto";
import {
  getStatementTopicEmbeddingDimensions,
  getStatementTopicEmbeddingModel,
} from "./config";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

type OpenAIEmbeddingsResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

export type StatementTopicEmbeddingSpec = {
  dimensions: number;
  model: string;
};

export class StatementTopicEmbeddingConfigError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured.") {
    super(message);
  }
}

export class StatementTopicEmbeddingRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`OpenAI topic embedding failed with status ${status}`);
  }
}

export function getStatementTopicEmbeddingSpec(): StatementTopicEmbeddingSpec {
  return {
    dimensions: getStatementTopicEmbeddingDimensions(),
    model: getStatementTopicEmbeddingModel(),
  };
}

export async function createStatementTopicEmbeddings(
  inputs: string[],
  spec = getStatementTopicEmbeddingSpec(),
) {
  if (inputs.length === 0) {
    return [];
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new StatementTopicEmbeddingConfigError();
  }

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    body: JSON.stringify({
      dimensions: spec.dimensions,
      input: inputs.map(normalizeEmbeddingInput),
      model: spec.model,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new StatementTopicEmbeddingRequestError(response.status, payload);
  }

  const data = (payload as OpenAIEmbeddingsResponse | null)?.data;

  if (!Array.isArray(data) || data.length !== inputs.length) {
    throw new Error("Embedding response count did not match input count.");
  }

  return [...data]
    .sort((first, second) => (first.index ?? 0) - (second.index ?? 0))
    .map((item) => {
      if (!Array.isArray(item.embedding)) {
        throw new Error("Embedding response item was missing vector.");
      }

      return item.embedding;
    });
}

export function buildStatementTopicEmbeddingText({
  coreSentence,
  organizationName,
  title,
}: {
  coreSentence: string;
  organizationName: string;
  title?: string | null;
}) {
  return [organizationName, title, coreSentence]
    .filter((value) => value?.trim())
    .join("\n")
    .slice(0, 2000);
}

export function hashStatementTopicEmbeddingText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function cosineSimilarity(first: number[], second: number[]) {
  let dot = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  const length = Math.min(first.length, second.length);

  for (let index = 0; index < length; index += 1) {
    const firstValue = first[index] ?? 0;
    const secondValue = second[index] ?? 0;
    dot += firstValue * secondValue;
    firstNorm += firstValue * firstValue;
    secondNorm += secondValue * secondValue;
  }

  if (!firstNorm || !secondNorm) {
    return 0;
  }

  return dot / (Math.sqrt(firstNorm) * Math.sqrt(secondNorm));
}

export function averageEmbeddings(embeddings: number[][]) {
  if (embeddings.length === 0) {
    return [];
  }

  const dimensions = embeddings[0]?.length ?? 0;
  const average = Array.from({ length: dimensions }, () => 0);

  for (const embedding of embeddings) {
    for (let index = 0; index < dimensions; index += 1) {
      average[index] += embedding[index] ?? 0;
    }
  }

  return average.map((value) => value / embeddings.length);
}

function normalizeEmbeddingInput(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 4000);
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
