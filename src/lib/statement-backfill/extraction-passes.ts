import "server-only";

import { runTelegramStatementExtractions } from "@/lib/telegram-statements/extraction-run";
import type { StatementBackfillRunResult } from "./run-types";

export async function runStatementBackfillExtractionPasses({
  dryRun,
  extractionLimit,
  extractionPasses,
  windowHours,
}: {
  dryRun: boolean;
  extractionLimit: number;
  extractionPasses: number;
  windowHours: number;
}) {
  const extraction: StatementBackfillRunResult["extraction"] = {
    extracted: 0,
    failed: 0,
    passes: [],
    pendingSeen: 0,
    skipped: 0,
  };

  for (let pass = 1; pass <= extractionPasses; pass += 1) {
    const passResult = await runTelegramStatementExtractions({
      dryRun,
      limit: extractionLimit,
      windowHours,
    });

    extraction.pendingSeen += passResult.pendingSeen;
    extraction.extracted += passResult.extracted;
    extraction.skipped += passResult.skipped;
    extraction.failed += passResult.failed;
    extraction.passes.push({
      extracted: passResult.extracted,
      failed: passResult.failed,
      pass,
      pendingSeen: passResult.pendingSeen,
      skipped: passResult.skipped,
    });

    if (dryRun || passResult.pendingSeen < extractionLimit) {
      break;
    }
  }

  return extraction;
}
