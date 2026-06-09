import "server-only";

import {
  getStatementTopicCrossSourceThreshold,
  getStatementTopicPartyThreshold,
} from "./config";
import { findBestTelegramMatch, findBestTopicMatch } from "./clustering";
import { upsertCrossSourceStatementTopic } from "./cross-source-topic";
import {
  hasTopicLexicalSupport,
  hasTopicLexicalSupportWithCluster,
} from "./lexical-support";
import {
  getRequiredStatementTopicSupabaseClient,
  markPartyStatementTopicMatched,
  markPartyStatementTopicUnmatched,
  upsertStatementTopicLinks,
} from "./repository";
import type { EmbeddedPartySummary, EmbeddedTelegramSummary } from "./types";
import type { SavedConfirmedTopic } from "./topic-persistence";

export type PartyTopicMatchingResult = {
  crossSourceMatches: number;
  matchedPartyStatements: number;
  partyUnmatched: number;
};

export async function matchPartySummariesToTopics({
  activeTopics,
  embeddedPartyRows,
  embeddedTelegramRows,
  supabase,
}: {
  activeTopics: SavedConfirmedTopic[];
  embeddedPartyRows: EmbeddedPartySummary[];
  embeddedTelegramRows: EmbeddedTelegramSummary[];
  supabase: ReturnType<typeof getRequiredStatementTopicSupabaseClient>;
}): Promise<PartyTopicMatchingResult> {
  const result: PartyTopicMatchingResult = {
    crossSourceMatches: 0,
    matchedPartyStatements: 0,
    partyUnmatched: 0,
  };

  for (const row of embeddedPartyRows) {
    if (row.topic_gate_status === "manual_hidden") {
      continue;
    }

    const best = findBestTopicMatch(row.embedding, activeTopics);

    if (
      best &&
      best.similarity >= getStatementTopicPartyThreshold() &&
      hasTopicLexicalSupportWithCluster(row, best.topic, best.similarity)
    ) {
      await upsertStatementTopicLinks({
        links: [
          {
            similarity: best.similarity,
            sourceKey: row.source_key,
            sourceSummaryId: row.id,
            sourceType: "party",
            sourceUrl: row.source_url,
            topicId: best.topic.id,
          },
        ],
        supabase,
      });
      await markPartyStatementTopicMatched({
        confidence: best.similarity,
        summaryId: row.id,
        supabase,
        topicId: best.topic.id,
      });
      result.matchedPartyStatements += 1;
      continue;
    }

    const directMatch = findBestTelegramMatch(row.embedding, embeddedTelegramRows);

    if (
      directMatch &&
      directMatch.similarity >= getStatementTopicCrossSourceThreshold() &&
      hasTopicLexicalSupport(row, directMatch.telegram, directMatch.similarity)
    ) {
      const topic = await upsertCrossSourceStatementTopic({
        party: row,
        similarity: directMatch.similarity,
        supabase,
        telegram: directMatch.telegram,
      });

      await markPartyStatementTopicMatched({
        confidence: directMatch.similarity,
        summaryId: row.id,
        supabase,
        topicId: topic.id,
      });
      result.crossSourceMatches += 1;
      result.matchedPartyStatements += 1;
    } else {
      await markPartyStatementTopicUnmatched({
        summaryId: row.id,
        supabase,
      });
      result.partyUnmatched += 1;
    }
  }

  return result;
}
