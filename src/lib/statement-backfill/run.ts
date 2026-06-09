import "server-only";

import { runPartyStatementIngest } from "@/lib/party-statements/run";
import { runStatementTopicMatching } from "@/lib/statement-topics/run";
import { runTelegramStatementFeedScan } from "@/lib/telegram-statements/run";
import { normalizeStatementBackfillOptions } from "./config";
import { getStatementBackfillCounts } from "./counts";
import { runStatementBackfillExtractionPasses } from "./extraction-passes";
import {
  summarizePartyBackfillResult,
  summarizeTelegramBackfillResult,
  summarizeTopicBackfillResult,
} from "./result-summary";
import type {
  StatementBackfillRunOptions,
  StatementBackfillRunResult,
} from "./run-types";

export type {
  NormalizedStatementBackfillOptions,
  StatementBackfillRunOptions,
  StatementBackfillRunResult,
} from "./run-types";

export async function runStatementBackfill(
  options: StatementBackfillRunOptions = {},
): Promise<StatementBackfillRunResult> {
  const normalized = normalizeStatementBackfillOptions(options);
  const telegram = await runTelegramStatementFeedScan({
    backfill: true,
    channelUsername: normalized.channelUsername ?? undefined,
    dryRun: normalized.dryRun,
    maxPagesPerChannel: normalized.telegramMaxPages,
    windowHours: normalized.windowHours,
  });
  const extraction = await runStatementBackfillExtractionPasses({
    dryRun: normalized.dryRun,
    extractionLimit: normalized.extractionLimit,
    extractionPasses: normalized.extractionPasses,
    windowHours: normalized.windowHours,
  });
  const party = await runPartyStatementIngest({
    dryRun: normalized.dryRun,
    limit: normalized.partyLimit,
    windowHours: normalized.windowHours,
  });
  const topics = await runStatementTopicMatching({
    dryRun: normalized.dryRun,
    limit: normalized.topicLimit,
    windowHours: normalized.windowHours,
  });
  const counts = await getStatementBackfillCounts({
    cutoffIso: normalized.cutoffIso,
  });

  return {
    counts,
    cutoffIso: normalized.cutoffIso,
    dryRun: normalized.dryRun,
    extraction,
    options: {
      channelUsername: normalized.channelUsername,
      dryRun: normalized.dryRun,
      extractionLimit: normalized.extractionLimit,
      extractionPasses: normalized.extractionPasses,
      partyLimit: normalized.partyLimit,
      telegramMaxPages: normalized.telegramMaxPages,
      topicLimit: normalized.topicLimit,
      windowHours: normalized.windowHours,
    },
    party: summarizePartyBackfillResult(party),
    telegram: summarizeTelegramBackfillResult(telegram),
    topics: summarizeTopicBackfillResult(topics),
    windowHours: normalized.windowHours,
  };
}
