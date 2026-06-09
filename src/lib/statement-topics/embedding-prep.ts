import "server-only";

import { ensureStatementTopicEmbeddings } from "./embedding-cache";
import type {
  PartyTopicSummaryRow,
  TelegramTopicSummaryRow,
} from "./repository-types";
import type { EmbeddedPartySummary, EmbeddedTelegramSummary } from "./types";

export async function embedTelegramTopicRows(
  rows: TelegramTopicSummaryRow[],
) {
  const embedded = await ensureStatementTopicEmbeddings({
    rows: rows.map((row) => ({
      coreSentence: row.core_sentence,
      id: row.id,
      organizationName: row.organization_name,
      sourceType: "telegram" as const,
      title: null,
    })),
    sourceType: "telegram",
  });

  return {
    created: embedded.created,
    rows: rows.flatMap((row): EmbeddedTelegramSummary[] => {
      const embedding = embedded.embeddings.get(row.id);

      if (!embedding) {
        return [];
      }

      return [
        {
          ...row,
          embedding: embedding.embedding,
          embeddingText: embedding.text,
        },
      ];
    }),
  };
}

export async function embedPartyTopicRows(rows: PartyTopicSummaryRow[]) {
  const embedded = await ensureStatementTopicEmbeddings({
    rows: rows.map((row) => ({
      coreSentence: row.core_sentence,
      id: row.id,
      organizationName: row.organization_name,
      sourceType: "party" as const,
      title: row.title,
    })),
    sourceType: "party",
  });

  return {
    created: embedded.created,
    rows: rows.flatMap((row): EmbeddedPartySummary[] => {
      const embedding = embedded.embeddings.get(row.id);

      if (!embedding) {
        return [];
      }

      return [
        {
          ...row,
          embedding: embedding.embedding,
          embeddingText: embedding.text,
        },
      ];
    }),
  };
}
