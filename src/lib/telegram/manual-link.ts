import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
} from "@/lib/x-ingest/ingest-run-repository";
import {
  createManualTelegramMediaKey,
  getExistingManualTelegramCandidate,
  upsertManualTelegramCandidate,
  upsertManualTelegramMedia,
} from "./manual-link-repository";
import { parseTelegramMessageLink } from "./manual-link-parser";
import { fetchTelegramPreview } from "./manual-link-preview";
import {
  TELEGRAM_MANUAL_LINK_STRATEGY,
  type ManualTelegramLinkResult,
} from "./manual-link-types";

export async function ingestManualTelegramLink({
  manualText,
  rawUrl,
}: {
  manualText?: string;
  rawUrl: string;
}): Promise<ManualTelegramLinkResult> {
  const link = parseTelegramMessageLink(rawUrl);
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  const runId = await createIngestRun(
    supabase,
    {
      collectionMode: TELEGRAM_MANUAL_LINK_STRATEGY,
      source: rawUrl,
      sourceRecordId: link.sourceRecordId,
    },
    TELEGRAM_MANUAL_LINK_STRATEGY,
  );
  const counters = createEmptyIngestCounters();

  try {
    const preview = await fetchTelegramPreview(link);
    const textSnapshot = pickTextSnapshot(manualText, preview.description);
    const sourceName = preview.sourceName || `@${link.channel}`;
    const mediaKeys = preview.imageUrl
      ? [createManualTelegramMediaKey(link, "og-image")]
      : [];
    const existingCandidate = await getExistingManualTelegramCandidate(
      supabase,
      link.sourceRecordId,
    );

    counters.postsSeen = 1;

    if (preview.imageUrl) {
      await upsertManualTelegramMedia({
        imageUrl: preview.imageUrl,
        link,
        preview,
        supabase,
      });
    }

    const result = await upsertManualTelegramCandidate({
      existingCandidate,
      link,
      mediaKeys,
      preview,
      sourceName,
      supabase,
      textSnapshot,
    });

    counters.candidatesCreated = result.created ? 1 : 0;
    await finishIngestRun(supabase, runId, "succeeded", counters);

    return result;
  } catch (error) {
    await finishIngestRun(supabase, runId, "failed", counters, error);
    throw error;
  }
}

function pickTextSnapshot(manualText: string | undefined, previewText: string) {
  return manualText?.trim() || previewText.trim();
}
