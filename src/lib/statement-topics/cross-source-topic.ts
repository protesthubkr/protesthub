import "server-only";

import { createHash } from "crypto";
import {
  averageEmbeddings,
  getStatementTopicEmbeddingSpec,
} from "./embedding";
import {
  getRequiredStatementTopicSupabaseClient,
  upsertStatementTopic,
  upsertStatementTopicLinks,
} from "./repository";
import type {
  EmbeddedPartySummary,
  EmbeddedTelegramSummary,
} from "./types";

export async function upsertCrossSourceStatementTopic({
  party,
  similarity,
  supabase,
  telegram,
}: {
  party: EmbeddedPartySummary;
  similarity: number;
  supabase: ReturnType<typeof getRequiredStatementTopicSupabaseClient>;
  telegram: EmbeddedTelegramSummary;
}) {
  const windowTimes = [telegram.message_created_at, party.published_at]
    .filter((value): value is string => Boolean(value))
    .sort();
  const windowStartedAt = windowTimes[0];
  const windowEndedAt = windowTimes.at(-1);

  if (!windowStartedAt || !windowEndedAt) {
    throw new Error("Cross-source topic was missing a window timestamp.");
  }

  const spec = getStatementTopicEmbeddingSpec();
  const row = await upsertStatementTopic({
    input: {
      centroidEmbedding: averageEmbeddings([telegram.embedding, party.embedding]),
      embeddingDimensions: spec.dimensions,
      embeddingModel: spec.model,
      metadata: {
        confirmationMode: "telegram_party_embedding",
        partySummaryId: party.id,
        similarity,
        telegramSummaryId: telegram.id,
      },
      representativeSourceUrl: telegram.source_url,
      representativeSummaryId: telegram.id,
      telegramMessageCount: 1,
      telegramSourceCount: 1,
      title: telegram.core_sentence,
      topicKey: buildCrossSourceTopicKey(telegram.id, party.id),
      windowEndedAt,
      windowStartedAt,
    },
    supabase,
  });

  await upsertStatementTopicLinks({
    links: [
      {
        similarity: 1,
        sourceKey: telegram.channel_username,
        sourceSummaryId: telegram.id,
        sourceType: "telegram",
        sourceUrl: telegram.source_url,
        topicId: row.id,
      },
      {
        similarity,
        sourceKey: party.source_key,
        sourceSummaryId: party.id,
        sourceType: "party",
        sourceUrl: party.source_url,
        topicId: row.id,
      },
    ],
    supabase,
  });

  return row;
}

function buildCrossSourceTopicKey(telegramId: string, partyId: string) {
  const value = `telegram:${telegramId}:party:${partyId}`;

  return `cross:${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}
