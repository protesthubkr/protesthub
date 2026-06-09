import "server-only";

import { fetchTelegramHtml, getMetaContent, normalizeText, stripHtml } from "./html";
import {
  createTelegramMessageFetchUrls,
  extractTelegramMessageImageUrls,
} from "./message-images";
import type { TelegramMessageLink, TelegramPreview } from "./manual-link-types";

export async function fetchTelegramPreview(
  link: TelegramMessageLink,
): Promise<TelegramPreview> {
  for (const url of createTelegramMessageFetchUrls(link)) {
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
