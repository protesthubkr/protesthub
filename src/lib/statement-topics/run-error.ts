import {
  StatementTopicEmbeddingConfigError,
  StatementTopicEmbeddingRequestError,
} from "./embedding";

export function getStatementTopicErrorMessage(error: unknown) {
  if (error instanceof StatementTopicEmbeddingConfigError) {
    return "missing_openai_api_key";
  }

  if (error instanceof StatementTopicEmbeddingRequestError) {
    return `openai_embedding_failed:${error.status}`;
  }

  return error instanceof Error ? error.message : String(error);
}
