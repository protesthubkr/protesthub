import "server-only";

import {
  getStatementTopicRunLimit,
  getStatementTopicWindowHours,
} from "./config";
import { clusterTelegramSummaries, toConfirmedTopic } from "./clustering";
import { embedPartyTopicRows, embedTelegramTopicRows } from "./embedding-prep";
import { matchPartySummariesToTopics } from "./party-matching";
import {
  getRecentPartyTopicSummaries,
  getRecentTelegramTopicSummaries,
  getRequiredStatementTopicSupabaseClient,
  markExpiredStatementTopics,
} from "./repository";
import type {
  StatementTopicRunOptions,
  StatementTopicRunResult,
} from "./run-types";
import { saveConfirmedTelegramTopics } from "./topic-persistence";
import type { ConfirmedTopic } from "./types";

export { getStatementTopicErrorMessage } from "./run-error";
export type { StatementTopicRunOptions, StatementTopicRunResult } from "./run-types";

export async function runStatementTopicMatching(
  options: StatementTopicRunOptions = {},
): Promise<StatementTopicRunResult> {
  const dryRun = options.dryRun ?? false;
  const limit = options.limit ?? getStatementTopicRunLimit();
  const windowHours = options.windowHours ?? getStatementTopicWindowHours();
  const cutoffIso = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();
  const supabase = getRequiredStatementTopicSupabaseClient();
  const telegramRows = await getRecentTelegramTopicSummaries({
    cutoffIso,
    limit,
    supabase,
  });
  const partyRows = await getRecentPartyTopicSummaries({
    cutoffIso,
    limit,
    supabase,
  });
  const result: StatementTopicRunResult = {
    confirmedTopics: 0,
    crossSourceMatches: 0,
    dryRun,
    embeddingsCreated: 0,
    matchedPartyStatements: 0,
    partyCandidatesSeen: partyRows.length,
    partyUnmatched: 0,
    telegramClusters: 0,
    telegramSummariesSeen: telegramRows.length,
    windowHours,
  };

  if (dryRun || telegramRows.length === 0) {
    return result;
  }

  await markExpiredStatementTopics({ cutoffIso, supabase });

  const telegramEmbedded = await embedTelegramTopicRows(telegramRows);
  result.embeddingsCreated += telegramEmbedded.created;

  const clusters = clusterTelegramSummaries(telegramEmbedded.rows);
  const confirmedTopics = clusters
    .map(toConfirmedTopic)
    .filter((topic): topic is ConfirmedTopic => Boolean(topic));

  result.telegramClusters = clusters.length;
  result.confirmedTopics = confirmedTopics.length;

  const activeTopics = await saveConfirmedTelegramTopics({
    confirmedTopics,
    supabase,
  });

  if (partyRows.length === 0) {
    return result;
  }

  const partyEmbedded = await embedPartyTopicRows(partyRows);
  result.embeddingsCreated += partyEmbedded.created;

  const partyMatching = await matchPartySummariesToTopics({
    activeTopics,
    embeddedPartyRows: partyEmbedded.rows,
    embeddedTelegramRows: telegramEmbedded.rows,
    supabase,
  });

  result.crossSourceMatches += partyMatching.crossSourceMatches;
  result.matchedPartyStatements += partyMatching.matchedPartyStatements;
  result.partyUnmatched += partyMatching.partyUnmatched;

  return result;
}
