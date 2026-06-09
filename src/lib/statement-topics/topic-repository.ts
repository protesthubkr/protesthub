import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { roundSimilarity } from "./repository-utils";
import type {
  StatementTopicRow,
  UpsertStatementTopicInput,
  UpsertStatementTopicLinkInput,
} from "./repository-types";

export async function markExpiredStatementTopics({
  cutoffIso,
  supabase,
}: {
  cutoffIso: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("statement_topics")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "confirmed")
    .lt("window_ended_at", cutoffIso);

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertStatementTopic({
  input,
  supabase,
}: {
  input: UpsertStatementTopicInput;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("statement_topics")
    .upsert(
      {
        centroid_embedding: input.centroidEmbedding,
        embedding_dimensions: input.embeddingDimensions,
        embedding_model: input.embeddingModel,
        metadata: input.metadata,
        representative_source_url: input.representativeSourceUrl,
        representative_summary_id: input.representativeSummaryId,
        status: "confirmed",
        telegram_message_count: input.telegramMessageCount,
        telegram_source_count: input.telegramSourceCount,
        title: input.title,
        topic_key: input.topicKey,
        updated_at: now,
        window_ended_at: input.windowEndedAt,
        window_started_at: input.windowStartedAt,
      },
      { onConflict: "topic_key" },
    )
    .select("id,topic_key")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to upsert statement topic.");
  }

  return data as unknown as StatementTopicRow;
}

export async function upsertStatementTopicLinks({
  links,
  supabase,
}: {
  links: UpsertStatementTopicLinkInput[];
  supabase: SupabaseClient;
}) {
  if (links.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("statement_topic_links").upsert(
    links.map((link) => ({
      matched_by: "embedding",
      similarity: roundSimilarity(link.similarity),
      source_key: link.sourceKey,
      source_summary_id: link.sourceSummaryId,
      source_type: link.sourceType,
      source_url: link.sourceUrl,
      topic_id: link.topicId,
      updated_at: now,
    })),
    {
      onConflict: "topic_id,source_type,source_summary_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}
