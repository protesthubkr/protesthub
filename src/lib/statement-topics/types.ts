import type {
  PartyTopicSummaryRow,
  TelegramTopicSummaryRow,
} from "./repository-types";

export type EmbeddedTelegramSummary = TelegramTopicSummaryRow & {
  embedding: number[];
  embeddingText: string;
};

export type EmbeddedPartySummary = PartyTopicSummaryRow & {
  embedding: number[];
  embeddingText: string;
};

export type TopicCluster = {
  centroid: number[];
  members: EmbeddedTelegramSummary[];
};

export type ConfirmedTopic = TopicCluster & {
  sourceCount: number;
  topicKey: string;
};

export type TopicLexicalSource = {
  core_sentence: string;
  title?: string | null;
};
