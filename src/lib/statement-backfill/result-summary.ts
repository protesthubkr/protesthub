import type { PartyStatementRunResult } from "@/lib/party-statements/run";
import type { StatementTopicRunResult } from "@/lib/statement-topics/run";
import type { TelegramStatementScanResult } from "@/lib/telegram-statements/types";
import type { StatementBackfillRunResult } from "./run-types";

export function summarizePartyBackfillResult(
  party: PartyStatementRunResult,
): StatementBackfillRunResult["party"] {
  return {
    detailsFetched: party.results.reduce(
      (sum, result) => sum + result.detailsFetched,
      0,
    ),
    documentsSeen: party.results.reduce(
      (sum, result) => sum + result.documentsSeen,
      0,
    ),
    extracted: party.extracted,
    failed: party.failed,
    outsideWindow: party.outsideWindow,
    skipped: party.skipped,
    stored: party.stored,
  };
}

export function summarizeTelegramBackfillResult(
  telegram: TelegramStatementScanResult,
): StatementBackfillRunResult["telegram"] {
  return {
    candidateMatches: telegram.candidateMatches,
    candidatesCreated: telegram.candidatesCreated,
    channelsScanned: telegram.channelsScanned,
    channelsSkipped: telegram.channelsSkipped,
    messagesSeen: telegram.messagesSeen,
    messagesWritten: telegram.messagesWritten,
  };
}

export function summarizeTopicBackfillResult(
  topics: StatementTopicRunResult,
): StatementBackfillRunResult["topics"] {
  return {
    confirmedTopics: topics.confirmedTopics,
    embeddingsCreated: topics.embeddingsCreated,
    matchedPartyStatements: topics.matchedPartyStatements,
    partyCandidatesSeen: topics.partyCandidatesSeen,
    partyUnmatched: topics.partyUnmatched,
    telegramClusters: topics.telegramClusters,
    telegramSummariesSeen: topics.telegramSummariesSeen,
  };
}
