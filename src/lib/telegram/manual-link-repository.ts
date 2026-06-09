import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExistingCandidateRow,
  ManualTelegramLinkResult,
  TelegramMessageLink,
  TelegramPreview,
} from "./manual-link-types";
import { TELEGRAM_MANUAL_LINK_STRATEGY } from "./manual-link-types";

export async function getExistingManualTelegramCandidate(
  supabase: SupabaseClient,
  sourceRecordId: string,
) {
  const { data, error } = await supabase
    .from("review_candidates")
    .select("id,review_reason")
    .eq("source_type", "telegram")
    .eq("source_record_id", sourceRecordId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ExistingCandidateRow | null) ?? null;
}

export async function upsertManualTelegramMedia({
  imageUrl,
  link,
  preview,
  supabase,
}: {
  imageUrl: string;
  link: TelegramMessageLink;
  preview: TelegramPreview;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.from("source_media").upsert(
    {
      alt_text: preview.title || `Telegram ${link.externalId}`,
      media_key: createManualTelegramMediaKey(link, "og-image"),
      media_type: "photo",
      preview_image_url: imageUrl,
      raw_payload: {
        preview,
        source_url: link.sourceUrl,
      },
      source_type: "telegram",
      url: imageUrl,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "media_key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertManualTelegramCandidate({
  existingCandidate,
  link,
  mediaKeys,
  preview,
  sourceName,
  supabase,
  textSnapshot,
}: {
  existingCandidate: ExistingCandidateRow | null;
  link: TelegramMessageLink;
  mediaKeys: string[];
  preview: TelegramPreview;
  sourceName: string;
  supabase: SupabaseClient;
  textSnapshot: string;
}): Promise<ManualTelegramLinkResult> {
  const reasons = mergeReasons(existingCandidate?.review_reason ?? [], [
    "manual_telegram_link",
    "manual_review_requested",
    ...(mediaKeys.length > 0 ? ["has_photo_media"] : []),
  ]);
  const values = {
    extraction_payload: {
      source: TELEGRAM_MANUAL_LINK_STRATEGY,
      source_type: "telegram",
      telegram: {
        channel: link.channel,
        message_id: link.messageId,
        preview_title: preview.title,
        scraped_description: preview.description,
      },
    },
    media_keys: mediaKeys,
    review_reason: reasons,
    source_name: sourceName,
    source_type: "telegram",
    source_url: link.sourceUrl,
    status: "needs_review",
    text_snapshot: textSnapshot,
    updated_at: new Date().toISOString(),
  };

  if (existingCandidate) {
    const { data, error } = await supabase
      .from("review_candidates")
      .update(values)
      .eq("id", existingCandidate.id)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update Telegram candidate.");
    }

    return {
      candidateId: data.id as string,
      created: false,
      sourceName,
      sourceUrl: link.sourceUrl,
    };
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .insert({
      source_record_id: link.sourceRecordId,
      ...values,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create Telegram candidate.");
  }

  return {
    candidateId: data.id as string,
    created: true,
    sourceName,
    sourceUrl: link.sourceUrl,
  };
}

export function createManualTelegramMediaKey(
  link: TelegramMessageLink,
  key: string,
) {
  return `telegram:${link.externalId}:${key}`;
}

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
