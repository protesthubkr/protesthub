import "server-only";

import { cosineSimilarity, getStatementTopicEmbeddingSpec } from "./embedding";
import {
  getRequiredStatementTopicSupabaseClient,
  upsertStatementTopic,
  upsertStatementTopicLinks,
} from "./repository";
import type { ConfirmedTopic } from "./types";

export type SavedConfirmedTopic = ConfirmedTopic & { id: string };

export async function saveConfirmedTelegramTopics({
  confirmedTopics,
  supabase,
}: {
  confirmedTopics: ConfirmedTopic[];
  supabase: ReturnType<typeof getRequiredStatementTopicSupabaseClient>;
}) {
  const savedTopics = await Promise.all(
    confirmedTopics.map(async (topic) => {
      const representative = topic.members[0];
      const windowStartedAt = topic.members
        .map((member) => member.message_created_at)
        .filter(Boolean)
        .sort()[0];
      const windowEndedAt = topic.members
        .map((member) => member.message_created_at)
        .filter(Boolean)
        .sort()
        .at(-1);

      if (!representative || !windowStartedAt || !windowEndedAt) {
        return null;
      }

      const row = await upsertStatementTopic({
        input: {
          centroidEmbedding: topic.centroid,
          embeddingDimensions: getStatementTopicEmbeddingSpec().dimensions,
          embeddingModel: getStatementTopicEmbeddingSpec().model,
          metadata: {
            memberSummaryIds: topic.members.map((member) => member.id),
          },
          representativeSourceUrl: representative.source_url,
          representativeSummaryId: representative.id,
          telegramMessageCount: topic.members.length,
          telegramSourceCount: topic.sourceCount,
          title: representative.core_sentence,
          topicKey: topic.topicKey,
          windowEndedAt,
          windowStartedAt,
        },
        supabase,
      });
      await upsertStatementTopicLinks({
        links: topic.members.map((member) => ({
          similarity: cosineSimilarity(topic.centroid, member.embedding),
          sourceKey: member.channel_username,
          sourceSummaryId: member.id,
          sourceType: "telegram" as const,
          sourceUrl: member.source_url,
          topicId: row.id,
        })),
        supabase,
      });

      return {
        ...topic,
        id: row.id,
      };
    }),
  );

  return savedTopics.filter((topic): topic is SavedConfirmedTopic =>
    Boolean(topic),
  );
}
