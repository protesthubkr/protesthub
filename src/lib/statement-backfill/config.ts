import type {
  NormalizedStatementBackfillOptions,
  StatementBackfillRunOptions,
} from "./run-types";

const DEFAULT_WINDOW_HOURS = 48;
const DEFAULT_EXTRACTION_LIMIT = 200;
const DEFAULT_EXTRACTION_PASSES = 5;
const DEFAULT_PARTY_LIMIT = 200;
const DEFAULT_TELEGRAM_MAX_PAGES = 60;
const DEFAULT_TOPIC_LIMIT = 500;

export function normalizeStatementBackfillOptions(
  options: StatementBackfillRunOptions,
): NormalizedStatementBackfillOptions {
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;

  return {
    channelUsername: options.channelUsername ?? null,
    cutoffIso: new Date(
      Date.now() - windowHours * 60 * 60 * 1000,
    ).toISOString(),
    dryRun: options.dryRun ?? true,
    extractionLimit: options.extractionLimit ?? DEFAULT_EXTRACTION_LIMIT,
    extractionPasses: options.extractionPasses ?? DEFAULT_EXTRACTION_PASSES,
    partyLimit: options.partyLimit ?? DEFAULT_PARTY_LIMIT,
    telegramMaxPages: options.telegramMaxPages ?? DEFAULT_TELEGRAM_MAX_PAGES,
    topicLimit: options.topicLimit ?? DEFAULT_TOPIC_LIMIT,
    windowHours,
  };
}
