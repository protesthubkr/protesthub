import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
} from "@/lib/x-ingest/repository";
import { fetchTelegramHtml, getMetaContent, normalizeText, stripHtml } from "./html";
import {
  createTelegramMessageFetchUrls,
  extractTelegramMessageImageUrls,
} from "./message-images";

const TELEGRAM_MANUAL_LINK_STRATEGY = "manual_telegram_message_link";

type TelegramMessageLink = {
  channel: string;
  externalId: string;
  messageId: string;
  sourceRecordId: string;
  sourceUrl: string;
};

type TelegramPreview = {
  description: string;
  imageUrl: string;
  sourceName: string;
  title: string;
};

type ExistingCandidateRow = {
  id: string;
  review_reason: string[];
};

export type ManualTelegramLinkResult = {
  candidateId: string;
  created: boolean;
  sourceName: string;
  sourceUrl: string;
};

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
      ? [createTelegramMediaKey(link, "og-image")]
      : [];
    const existingCandidate = await getExistingCandidate(
      supabase,
      link.sourceRecordId,
    );

    counters.postsSeen = 1;

    if (preview.imageUrl) {
      await upsertTelegramMedia({
        imageUrl: preview.imageUrl,
        link,
        preview,
        supabase,
      });
    }

    const result = await upsertTelegramCandidate({
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

export function parseTelegramMessageLink(rawUrl: string): TelegramMessageLink {
  const value = rawUrl.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("텔레그램 메시지 공유 링크를 입력하세요.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  if (hostname !== "t.me" && hostname !== "telegram.me") {
    throw new Error("t.me 또는 telegram.me 메시지 링크만 입력할 수 있습니다.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const isPrivateChannelPath = segments[0] === "c";
  const channel = isPrivateChannelPath ? `c/${segments[1] ?? ""}` : segments[0];
  const messageId = isPrivateChannelPath ? segments[2] : segments[1];

  if (!channel || !messageId || !/^\d+$/.test(messageId)) {
    throw new Error("URL에서 텔레그램 채널명과 메시지 ID를 찾지 못했습니다.");
  }

  const normalizedChannel = channel.replace(/^@/, "");
  const sourceUrl = `https://t.me/${normalizedChannel}/${messageId}`;
  const externalId = `${normalizedChannel}:${messageId}`;

  return {
    channel: normalizedChannel,
    externalId,
    messageId,
    sourceRecordId: `telegram:${externalId}`,
    sourceUrl,
  };
}

async function fetchTelegramPreview(
  link: TelegramMessageLink,
): Promise<TelegramPreview> {
  const urls = createTelegramPreviewUrls(link);

  for (const url of urls) {
    try {
      const html = await fetchTelegramHtml(url);
      const preview = parseTelegramPreviewHtml(html, link);

      if (preview.description || preview.imageUrl || preview.title) {
        return preview;
      }
    } catch {
      continue;
    }
  }

  return {
    description: "",
    imageUrl: "",
    sourceName: `@${link.channel}`,
    title: "",
  };
}

function createTelegramPreviewUrls(link: TelegramMessageLink) {
  return createTelegramMessageFetchUrls(link);
}

function parseTelegramPreviewHtml(
  html: string,
  link: TelegramMessageLink,
): TelegramPreview {
  const widgetText = extractWidgetMessageText(html);
  const ogDescription = getMetaContent(html, "og:description");
  const title = normalizeText(getMetaContent(html, "og:title"));
  const imageUrl = extractTelegramMessageImageUrls(html)[0] ?? "";

  return {
    description: widgetText || normalizeText(ogDescription),
    imageUrl,
    sourceName: getSourceName(link, title),
    title,
  };
}

function extractWidgetMessageText(html: string) {
  const match = html.match(
    /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );

  if (!match?.[1]) {
    return "";
  }

  return normalizeText(stripHtml(match[1]));
}

function getSourceName(link: TelegramMessageLink, title: string) {
  const cleanedTitle = title
    .replace(/^Telegram:\s*/i, "")
    .replace(/\s+on Telegram$/i, "")
    .trim();

  if (cleanedTitle && !cleanedTitle.toLowerCase().includes("telegram")) {
    return cleanedTitle;
  }

  return `@${link.channel}`;
}

function pickTextSnapshot(manualText: string | undefined, previewText: string) {
  return manualText?.trim() || previewText.trim();
}

function createTelegramMediaKey(link: TelegramMessageLink, key: string) {
  return `telegram:${link.externalId}:${key}`;
}

async function upsertTelegramMedia({
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
      media_key: createTelegramMediaKey(link, "og-image"),
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

async function upsertTelegramCandidate({
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
}) {
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

async function getExistingCandidate(
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

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
