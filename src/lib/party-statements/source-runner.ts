import "server-only";

import { fetchPartyStatementHtml } from "./html";
import {
  getRequiredPartyStatementSupabaseClient,
  markPartyStatementSourceScanFinished,
  upsertPartyStatementDocument,
  upsertPartyStatementSource,
  upsertPartyStatementSummaryCandidate,
} from "./repository";
import {
  getPartyStatementErrorMessage,
  processPartyStatementSummary,
} from "./summary-extraction";
import type {
  PartyStatementRunOutcome,
  PartyStatementRunSourceResult,
} from "./run-types";
import type {
  PartyStatementDocument,
  PartyStatementSourceParser,
} from "./types";

export async function runPartyStatementSource({
  cutoffIso,
  dryRun,
  limit,
  source,
}: {
  cutoffIso: string | null;
  dryRun: boolean;
  limit: number;
  source: PartyStatementSourceParser;
}) {
  const supabase = dryRun ? null : getRequiredPartyStatementSupabaseClient();
  const result: PartyStatementRunSourceResult = {
    detailsFetched: 0,
    documentsSeen: 0,
    extracted: 0,
    failed: 0,
    outcomes: [],
    outsideWindow: 0,
    skipped: 0,
    sourceKey: source.sourceKey,
    stored: 0,
  };

  try {
    if (supabase) {
      await upsertPartyStatementSource({ source, supabase });
    }

    const listHtml = await fetchPartyStatementHtml({
      allowInsecureTls: source.allowInsecureTls,
      url: source.listUrl,
    });
    const parsedListItems = source.parseList(listHtml);
    const listItems = parsedListItems
      .filter((listItem) => shouldIncludePartyListItem(listItem, cutoffIso))
      .slice(0, limit);
    result.documentsSeen = parsedListItems.length;
    result.outsideWindow = parsedListItems.length - listItems.length;

    for (const listItem of listItems) {
      const detailHtml = await fetchPartyStatementHtml({
        allowInsecureTls: source.allowInsecureTls,
        url: listItem.sourceUrl,
      });
      const document = source.parseDetail(detailHtml, listItem);

      result.detailsFetched += 1;

      if (!document) {
        result.skipped += 1;
        result.outcomes.push({
          organizationName: source.organizationName,
          sourceKey: source.sourceKey,
          sourceUrl: listItem.sourceUrl,
          status: "skipped",
          title: listItem.title,
        });
        continue;
      }

      if (dryRun || !supabase) {
        result.outcomes.push(toPartyStatementRunOutcome(document, "seen"));
        continue;
      }

      const documentId = await upsertPartyStatementDocument({
        document,
        supabase,
      });
      const summary = await upsertPartyStatementSummaryCandidate({
        document,
        documentId,
        supabase,
      });

      result.stored += 1;

      if (summary.status === "extracted") {
        result.outcomes.push(
          toPartyStatementRunOutcome(document, "already_extracted"),
        );
        continue;
      }

      const extractionStatus = await processPartyStatementSummary(summary);
      result.outcomes.push(toPartyStatementRunOutcome(document, extractionStatus));

      if (extractionStatus === "extracted") {
        result.extracted += 1;
      } else if (extractionStatus === "skipped") {
        result.skipped += 1;
      } else if (extractionStatus === "failed") {
        result.failed += 1;
      }
    }

    if (supabase) {
      await markPartyStatementSourceScanFinished({
        sourceKey: source.sourceKey,
        supabase,
      });
    }
  } catch (error) {
    result.failed += 1;

    if (supabase) {
      await markPartyStatementSourceScanFinished({
        errorMessage: getPartyStatementErrorMessage(error),
        sourceKey: source.sourceKey,
        supabase,
      });
    }

    result.outcomes.push({
      organizationName: source.organizationName,
      sourceKey: source.sourceKey,
      status: "failed",
    });
  }

  return result;
}

function shouldIncludePartyListItem(
  listItem: { publishedAt: string | null },
  cutoffIso: string | null,
) {
  if (!cutoffIso || !listItem.publishedAt) {
    return true;
  }

  return listItem.publishedAt >= cutoffIso;
}

function toPartyStatementRunOutcome(
  document: PartyStatementDocument,
  status: PartyStatementRunOutcome["status"],
): PartyStatementRunOutcome {
  return {
    documentType: document.documentType,
    externalId: document.externalId,
    organizationName: document.organizationName,
    sourceKey: document.sourceKey,
    sourceUrl: document.sourceUrl,
    status,
    title: document.title,
  };
}
