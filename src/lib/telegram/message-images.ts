import "server-only";

import { fetchTelegramHtml, getMetaContent, normalizeText } from "./html";

export type TelegramMessageLocator = {
  channel: string;
  externalId: string;
  messageId: string;
  sourceUrl: string;
};

export type TelegramMessageImageFetchResult = {
  fetchedUrl: string | null;
  imageUrls: string[];
};

const TELEGRAM_MESSAGE_IMAGE_CLASS_PATTERN =
  /<[^>]*\b(?:tgme_widget_message_photo_wrap|tgme_widget_message_video_thumb)\b[^>]*>/gi;

export async function fetchTelegramMessageImageUrls(
  message: TelegramMessageLocator,
): Promise<TelegramMessageImageFetchResult> {
  for (const url of createTelegramMessageFetchUrls(message)) {
    try {
      const html = await fetchTelegramHtml(url);
      const imageUrls = extractTelegramMessageImageUrls(html);

      if (imageUrls.length > 0) {
        return {
          fetchedUrl: url,
          imageUrls,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    fetchedUrl: null,
    imageUrls: [],
  };
}

export function createTelegramMessageFetchUrls(message: TelegramMessageLocator) {
  if (message.channel.startsWith("c/")) {
    return [`${message.sourceUrl}?embed=1&mode=tme`, message.sourceUrl];
  }

  return [
    `${message.sourceUrl}?embed=1&mode=tme`,
    `https://t.me/s/${message.channel}/${message.messageId}`,
    message.sourceUrl,
  ];
}

export function extractTelegramMessageImageUrls(html: string) {
  return uniqueNonEmpty([
    ...extractWidgetBackgroundImageUrls(html),
    normalizeText(getMetaContent(html, "og:image")),
  ]);
}

function extractWidgetBackgroundImageUrls(html: string) {
  return Array.from(html.matchAll(TELEGRAM_MESSAGE_IMAGE_CLASS_PATTERN))
    .map((match) => getStyleAttribute(match[0]))
    .map(extractBackgroundImageUrl)
    .filter(Boolean);
}

function getStyleAttribute(tag: string) {
  const match = tag.match(/\bstyle=(["'])([\s\S]*?)\1/i);
  return match?.[2] ?? "";
}

function extractBackgroundImageUrl(style: string) {
  const normalized = normalizeText(style);
  const match = normalized.match(
    /background-image\s*:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i,
  );

  return normalizeText(match?.[2] ?? "");
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
