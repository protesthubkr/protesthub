import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { mergeCandidateMediaKeys } from "@/lib/x-ingest/hydration-state";
import { parseTelegramMessageLink } from "./manual-link-parser";
import {
  fetchTelegramMessageImageUrls,
  type TelegramMessageLocator,
} from "./message-images";

export type TelegramCandidateImageLoadResult = {
  candidateId: string;
  imageCount: number;
};

type TelegramCandidateImageRow = {
  extraction_payload: Record<string, unknown>;
  id: string;
  media_keys: string[] | null;
  review_reason: string[] | null;
  source_name: string;
  source_record_id: string;
  source_type: string;
  source_url: string;
};

type ExistingMediaRow = {
  media_key: string;
  preview_image_url: string | null;
  url: string | null;
};

export async function loadTelegramCandidateImages(
  candidateId: string,
): Promise<TelegramCandidateImageLoadResult> {
  const supabase = getRequiredSupabaseAdminClient();
  const candidate = await getTelegramCandidateForImageLoad(supabase, candidateId);
  const message = getTelegramMessageLocator(candidate);
  const imageFetch = await fetchTelegramMessageImageUrls(message);
  const imageUrls = imageFetch.imageUrls;

  if (imageUrls.length === 0) {
    throw new Error("텔레그램 원본 메시지에서 이미지를 찾지 못했습니다.");
  }

  const existingMedia = await getExistingCandidateMedia(
    supabase,
    candidate.media_keys ?? [],
  );
  const mediaKeys = getImageMediaKeys({
    existingMedia,
    imageUrls,
    message,
  });

  await upsertTelegramCandidateImageMedia({
    candidate,
    imageFetchUrl: imageFetch.fetchedUrl,
    imageUrls,
    mediaKeys,
    message,
    supabase,
  });
  await updateTelegramCandidateMediaKeys({
    candidate,
    imageFetchUrl: imageFetch.fetchedUrl,
    mediaKeys,
    supabase,
  });

  return {
    candidateId,
    imageCount: imageUrls.length,
  };
}

async function getTelegramCandidateForImageLoad(
  supabase: SupabaseClient,
  candidateId: string,
) {
  const { data, error } = await supabase
    .from("review_candidates")
    .select(
      [
        "id",
        "source_type",
        "source_record_id",
        "source_name",
        "source_url",
        "media_keys",
        "extraction_payload",
        "review_reason",
      ].join(","),
    )
    .eq("id", candidateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "텔레그램 후보를 찾지 못했습니다.");
  }

  const candidate = data as unknown as TelegramCandidateImageRow;

  if (candidate.source_type !== "telegram") {
    throw new Error("텔레그램 후보만 이미지를 불러올 수 있습니다.");
  }

  return candidate;
}

async function getExistingCandidateMedia(
  supabase: SupabaseClient,
  mediaKeys: string[],
) {
  const uniqueMediaKeys = Array.from(new Set(mediaKeys));

  if (uniqueMediaKeys.length === 0) {
    return [] satisfies ExistingMediaRow[];
  }

  const { data, error } = await supabase
    .from("source_media")
    .select("media_key,url,preview_image_url")
    .in("media_key", uniqueMediaKeys);

  if (error || !data) {
    throw new Error(error?.message ?? "기존 이미지 정보를 불러오지 못했습니다.");
  }

  return data as unknown as ExistingMediaRow[];
}

async function upsertTelegramCandidateImageMedia({
  candidate,
  imageFetchUrl,
  imageUrls,
  mediaKeys,
  message,
  supabase,
}: {
  candidate: TelegramCandidateImageRow;
  imageFetchUrl: string | null;
  imageUrls: string[];
  mediaKeys: string[];
  message: TelegramMessageLocator;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("source_media").upsert(
    imageUrls.map((imageUrl, index) => ({
      alt_text: `${candidate.source_name} ${message.messageId}`.trim(),
      media_key: mediaKeys[index],
      media_type: "photo",
      preview_image_url: imageUrl,
      raw_payload: {
        fetched_url: imageFetchUrl,
        message_id: message.messageId,
        source_url: message.sourceUrl,
      },
      source_type: "telegram",
      url: imageUrl,
      last_seen_at: now,
    })),
    { onConflict: "media_key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function updateTelegramCandidateMediaKeys({
  candidate,
  imageFetchUrl,
  mediaKeys,
  supabase,
}: {
  candidate: TelegramCandidateImageRow;
  imageFetchUrl: string | null;
  mediaKeys: string[];
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const nextMediaKeys = mergeCandidateMediaKeys(candidate.media_keys, mediaKeys);
  const nextPayload = {
    ...(candidate.extraction_payload ?? {}),
    telegram_image_load: {
      fetched_url: imageFetchUrl,
      image_count: mediaKeys.length,
      ran_at: now,
    },
  };
  const { error } = await supabase
    .from("review_candidates")
    .update({
      extraction_payload: nextPayload,
      media_keys: nextMediaKeys,
      review_reason: mergeReasons(candidate.review_reason ?? [], [
        "telegram_image_loaded",
        "has_photo_media",
      ]),
      updated_at: now,
    })
    .eq("id", candidate.id);

  if (error) {
    throw new Error(error.message);
  }
}

function getImageMediaKeys({
  existingMedia,
  imageUrls,
  message,
}: {
  existingMedia: ExistingMediaRow[];
  imageUrls: string[];
  message: TelegramMessageLocator;
}) {
  const existingKeyByUrl = new Map(
    existingMedia.flatMap((media) =>
      [media.url, media.preview_image_url]
        .filter((url): url is string => Boolean(url))
        .map((url) => [url, media.media_key] as const),
    ),
  );

  return imageUrls.map(
    (imageUrl, index) =>
      existingKeyByUrl.get(imageUrl) ?? createTelegramImageMediaKey(message, index),
  );
}

function getTelegramMessageLocator(
  candidate: TelegramCandidateImageRow,
): TelegramMessageLocator {
  try {
    return parseTelegramMessageLink(candidate.source_url);
  } catch {
    return getTelegramMessageLocatorFromSourceRecord(candidate.source_record_id);
  }
}

function getTelegramMessageLocatorFromSourceRecord(
  sourceRecordId: string,
): TelegramMessageLocator {
  const externalId = sourceRecordId.replace(/^telegram:/, "");
  const lastSeparatorIndex = externalId.lastIndexOf(":");
  const channel = externalId.slice(0, lastSeparatorIndex);
  const messageId = externalId.slice(lastSeparatorIndex + 1);

  if (!channel || !/^\d+$/.test(messageId)) {
    throw new Error("텔레그램 후보의 원본 메시지 정보를 확인하지 못했습니다.");
  }

  return {
    channel,
    externalId,
    messageId,
    sourceUrl: `https://t.me/${channel}/${messageId}`,
  };
}

function createTelegramImageMediaKey(
  message: TelegramMessageLocator,
  index: number,
) {
  return `telegram:${message.externalId}:image:${index}`;
}

function getRequiredSupabaseAdminClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
