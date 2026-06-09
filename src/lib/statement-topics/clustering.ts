import { createHash } from "crypto";
import { getStatementTopicTelegramThreshold } from "./config";
import { averageEmbeddings, cosineSimilarity } from "./embedding";
import { hasTopicLexicalSupportWithCluster } from "./lexical-support";
import type {
  ConfirmedTopic,
  EmbeddedTelegramSummary,
  TopicCluster,
} from "./types";

export function clusterTelegramSummaries(rows: EmbeddedTelegramSummary[]) {
  const threshold = getStatementTopicTelegramThreshold();
  const clusters: TopicCluster[] = [];

  for (const row of rows) {
    const best = findBestCluster(row.embedding, clusters);

    if (
      best &&
      best.similarity >= threshold &&
      hasTopicLexicalSupportWithCluster(row, best.cluster, best.similarity)
    ) {
      best.cluster.members.push(row);
      best.cluster.centroid = averageEmbeddings(
        best.cluster.members.map((member) => member.embedding),
      );
      continue;
    }

    clusters.push({
      centroid: row.embedding,
      members: [row],
    });
  }

  return clusters;
}

export function toConfirmedTopic(cluster: TopicCluster) {
  const sourceCount = new Set(
    cluster.members.map((member) => member.channel_username),
  ).size;

  if (sourceCount < 2) {
    return null;
  }

  const representative = cluster.members[0];

  if (!representative) {
    return null;
  }

  return {
    ...cluster,
    sourceCount,
    topicKey: buildTopicKey(cluster.members),
  };
}

export function findBestTopicMatch(
  embedding: number[],
  topics: Array<ConfirmedTopic & { id: string }>,
) {
  return topics
    .map((topic) => ({
      similarity: cosineSimilarity(embedding, topic.centroid),
      topic,
    }))
    .sort((first, second) => second.similarity - first.similarity)[0];
}

export function findBestTelegramMatch(
  embedding: number[],
  telegramRows: EmbeddedTelegramSummary[],
) {
  return telegramRows
    .map((telegram) => ({
      similarity: cosineSimilarity(embedding, telegram.embedding),
      telegram,
    }))
    .sort((first, second) => second.similarity - first.similarity)[0];
}

function findBestCluster(embedding: number[], clusters: TopicCluster[]) {
  return clusters
    .map((cluster) => ({
      cluster,
      similarity: cosineSimilarity(embedding, cluster.centroid),
    }))
    .sort((first, second) => second.similarity - first.similarity)[0];
}

function buildTopicKey(members: EmbeddedTelegramSummary[]) {
  const ids = members
    .map((member) => member.id)
    .sort()
    .join(":");

  return `tg:${createHash("sha256").update(ids).digest("hex").slice(0, 24)}`;
}
