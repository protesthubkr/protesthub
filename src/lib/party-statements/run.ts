import "server-only";

import {
  getPartyStatementCutoffIso,
  getPartyStatementRunLimit,
} from "./run-config";
import { runPartyStatementSource } from "./source-runner";
import { getPartyStatementSources } from "./sources";
import type { PartyStatementRunOptions } from "./types";
import type { PartyStatementRunResult } from "./run-types";

export type {
  PartyStatementExtractionStatus,
  PartyStatementRunOutcome,
  PartyStatementRunResult,
  PartyStatementRunSourceResult,
} from "./run-types";

export async function runPartyStatementIngest(
  options: PartyStatementRunOptions = {},
): Promise<PartyStatementRunResult> {
  const dryRun = options.dryRun ?? false;
  const limit = getPartyStatementRunLimit(options.limit);
  const cutoffIso = getPartyStatementCutoffIso(options.windowHours);
  const sources = getPartyStatementSources(options.source);
  const result: PartyStatementRunResult = {
    cutoffIso,
    dryRun,
    extracted: 0,
    failed: 0,
    outsideWindow: 0,
    results: [],
    skipped: 0,
    sourcesSeen: sources.length,
    stored: 0,
  };

  for (const source of sources) {
    const sourceResult = await runPartyStatementSource({
      dryRun,
      cutoffIso,
      limit,
      source,
    });
    result.results.push(sourceResult);
    result.extracted += sourceResult.extracted;
    result.failed += sourceResult.failed;
    result.outsideWindow += sourceResult.outsideWindow;
    result.skipped += sourceResult.skipped;
    result.stored += sourceResult.stored;
  }

  return result;
}
