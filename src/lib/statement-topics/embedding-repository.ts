import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmbedding } from "./repository-utils";
import type { TopicEmbeddingRow, TopicSourceType } from "./repository-types";

export async function getStoredTopicEmbeddings({
  dimensions,
  model,
  sourceSummaryIds,
  sourceType,
  supabase,
}: {
  dimensions: number;
  model: string;
  sourceSummaryIds: string[];
  sourceType: TopicSourceType;
  supabase: SupabaseClient;
}) {
  if (sourceSummaryIds.length === 0) {
    return new Map<string, TopicEmbeddingRow>();
  }

  const { data, error } = await supabase
    .from("statement_topic_embeddings")
    .select(
      [
        "source_type",
        "source_summary_id",
        "embedding_model",
        "embedding_dimensions",
        "content_hash",
        "embedding",
      ].join(","),
    )
    .eq("source_type", sourceType)
    .eq("embedding_model", model)
    .eq("embedding_dimensions", dimensions)
    .in("source_summary_id", sourceSummaryIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data as unknown as TopicEmbeddingRow[] | null) ?? []).map((row) => [
      row.source_summary_id,
      {
        ...row,
        embedding: normalizeEmbedding(row.embedding),
      },
    ]),
  );
}

export async function upsertTopicEmbeddings({
  rows,
  supabase,
}: {
  rows: TopicEmbeddingRow[];
  supabase: SupabaseClient;
}) {
  if (rows.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("statement_topic_embeddings").upsert(
    rows.map((row) => ({
      content_hash: row.content_hash,
      embedding: row.embedding,
      embedding_dimensions: row.embedding_dimensions,
      embedding_model: row.embedding_model,
      source_summary_id: row.source_summary_id,
      source_type: row.source_type,
      updated_at: now,
    })),
    {
      onConflict:
        "source_type,source_summary_id,embedding_model,embedding_dimensions",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}
