import "server-only";

import { scanTelegramStatementChannel } from "./channel-scan";
import {
  createTelegramStatementScanRun,
  finishTelegramStatementScanRun,
  getRequiredSupabaseAdminClient,
  getStatementFeedSubscriptions,
} from "./repository";
import { getMaxPagesPerChannel, getWindowHours } from "./run-config";
import type {
  TelegramStatementRunOptions,
  TelegramStatementScanResult,
} from "./types";

export async function runTelegramStatementFeedScan(
  options: TelegramStatementRunOptions = {},
): Promise<TelegramStatementScanResult> {
  const supabase = getRequiredSupabaseAdminClient();
  const backfill = options.backfill ?? false;
  const dryRun = options.dryRun ?? false;
  const windowHours = backfill ? getWindowHours(options.windowHours) : null;
  const cutoffIso = windowHours
    ? new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
    : null;
  const runId = await createTelegramStatementScanRun({ dryRun, supabase });
  const totals: TelegramStatementScanResult = {
    backfill,
    candidatesCreated: 0,
    candidateMatches: 0,
    channelsScanned: 0,
    channelsSkipped: 0,
    cutoffIso,
    dryRun,
    messagesSeen: 0,
    messagesWritten: 0,
    results: [],
    runId,
    windowHours,
  };

  try {
    const subscriptions = await getStatementFeedSubscriptions({
      channelUsername: options.channelUsername,
      supabase,
    });

    for (const subscription of subscriptions) {
      const channelResult = await scanTelegramStatementChannel({
        backfill,
        cutoffIso,
        dryRun,
        maxPagesPerChannel: getMaxPagesPerChannel({
          backfill,
          optionValue: options.maxPagesPerChannel,
        }),
        subscription,
        supabase,
      });

      totals.results.push(channelResult);

      if (channelResult.skippedBecauseLocked) {
        totals.channelsSkipped += 1;
        continue;
      }

      totals.channelsScanned += 1;
      totals.candidatesCreated += channelResult.candidatesCreated;
      totals.candidateMatches += channelResult.candidateMatches;
      totals.messagesSeen += channelResult.messagesSeen;
      totals.messagesWritten += channelResult.messagesWritten;
    }

    await finishRun({
      status: "succeeded",
      runId,
      supabase,
      totals,
    });

    return totals;
  } catch (error) {
    await finishRun({
      errorMessage: error instanceof Error ? error.message : String(error),
      status: "failed",
      runId,
      supabase,
      totals,
    });

    throw error;
  }
}

async function finishRun({
  errorMessage,
  runId,
  status,
  supabase,
  totals,
}: {
  errorMessage?: string;
  runId: string | null;
  status: "failed" | "succeeded";
  supabase: ReturnType<typeof getRequiredSupabaseAdminClient>;
  totals: TelegramStatementScanResult;
}) {
  await finishTelegramStatementScanRun({
    errorMessage,
    runId,
    status,
    supabase,
    totals: {
      candidatesCreated: totals.candidatesCreated,
      channelsSeen: totals.channelsScanned,
      messagesSeen: totals.messagesSeen,
      messagesWritten: totals.messagesWritten,
    },
  });
}
