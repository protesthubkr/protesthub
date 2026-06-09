import "server-only";

import {
  buildStatementTopicEmbeddingText,
  createStatementTopicEmbeddings,
  getStatementTopicEmbeddingSpec,
  hashStatementTopicEmbeddingText,
} from "./embedding";
import {
  getRequiredStatementTopicSupabaseClient,
  getStoredTopicEmbeddings,
  upsertTopicEmbeddings,
  type TopicEmbeddingRow,
  type TopicSourceType,
} from "./repository";

export async function ensureStatementTopicEmbeddings({
  rows,
  sourceType,
}: {
  rows: Array<{
    coreSentence: string;
    id: string;
    organizationName: string;
    sourceType: TopicSourceType;
    title?: string | null;
  }>;
  sourceType: TopicSourceType;
}) {
  const supabase = getRequiredStatementTopicSupabaseClient();
  const spec = getStatementTopicEmbeddingSpec();
  const stored = await getStoredTopicEmbeddings({
    dimensions: spec.dimensions,
    model: spec.model,
    sourceSummaryIds: rows.map((row) => row.id),
    sourceType,
    supabase,
  });
  const embeddings = new Map<
    string,
    {
      embedding: number[];
      text: string;
    }
  >();
  const missing: Array<{
    contentHash: string;
    id: string;
    text: string;
  }> = [];

  for (const row of rows) {
    const text = buildStatementTopicEmbeddingText({
      coreSentence: row.coreSentence,
      organizationName: row.organizationName,
      title: row.title,
    });
    const contentHash = hashStatementTopicEmbeddingText(text);
    const storedEmbedding = stored.get(row.id);

    if (storedEmbedding?.content_hash === contentHash) {
      embeddings.set(row.id, {
        embedding: storedEmbedding.embedding,
        text,
      });
      continue;
    }

    missing.push({
      contentHash,
      id: row.id,
      text,
    });
  }

  if (missing.length > 0) {
    const createdEmbeddings = await createStatementTopicEmbeddings(
      missing.map((row) => row.text),
      spec,
    );
    const rowsToWrite: TopicEmbeddingRow[] = missing.map((row, index) => ({
      content_hash: row.contentHash,
      embedding: createdEmbeddings[index] ?? [],
      embedding_dimensions: spec.dimensions,
      embedding_model: spec.model,
      source_summary_id: row.id,
      source_type: sourceType,
    }));

    await upsertTopicEmbeddings({
      rows: rowsToWrite,
      supabase,
    });

    for (const row of rowsToWrite) {
      embeddings.set(row.source_summary_id, {
        embedding: row.embedding,
        text: missing.find((item) => item.id === row.source_summary_id)?.text ?? "",
      });
    }
  }

  return {
    created: missing.length,
    embeddings,
  };
}
