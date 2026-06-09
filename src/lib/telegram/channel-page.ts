import "server-only";

import {
  fetchTelegramHtml,
  getMetaContent,
  normalizeText,
  stripHtml,
} from "./html";
import { extractTelegramMessageImageUrls } from "./message-images";

export type TelegramChannelMessage = {
  createdAt: string | null;
  imageUrls: string[];
  messageId: number;
  rawHtml: string;
  sourceUrl: string;
  text: string;
};

export type TelegramChannelPage = {
  beforeMessageId: number | null;
  channelTitle: string;
  messages: TelegramChannelMessage[];
};

export async function fetchTelegramChannelPage(
  channelUsername: string,
  beforeMessageId?: number | null,
): Promise<TelegramChannelPage> {
  const url = beforeMessageId
    ? `${createTelegramChannelSourceUrl(channelUsername)}?before=${beforeMessageId}`
    : createTelegramChannelSourceUrl(channelUsername);
  const html = await fetchTelegramHtml(url);

  return parseTelegramChannelPage(html, channelUsername);
}

export function createTelegramChannelSourceUrl(channelUsername: string) {
  return `https://t.me/s/${channelUsername}`;
}

function parseTelegramChannelPage(
  html: string,
  channelUsername: string,
): TelegramChannelPage {
  const channelTitle = getChannelTitle(html, channelUsername);
  const beforeMessageId = getBeforeMessageId(html);
  const messageStarts = Array.from(
    html.matchAll(
      /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"/g,
    ),
  )
    .map((match) => ({
      dataPost: match[1],
      index: match.index ?? 0,
    }))
    .filter((item) => item.dataPost.startsWith(`${channelUsername}/`));
  const messages: TelegramChannelMessage[] = [];

  for (let index = 0; index < messageStarts.length; index += 1) {
    const current = messageStarts[index];
    const next = messageStarts[index + 1];
    const rawHtml = html.slice(current.index, next?.index ?? html.length);
    const messageId = Number.parseInt(current.dataPost.split("/")[1] ?? "", 10);

    if (!Number.isFinite(messageId)) {
      continue;
    }

    messages.push({
      createdAt: extractMessageDateTime(rawHtml),
      imageUrls: extractTelegramMessageImageUrls(rawHtml),
      messageId,
      rawHtml,
      sourceUrl: `https://t.me/${channelUsername}/${messageId}`,
      text: extractMessageText(rawHtml),
    });
  }

  return {
    beforeMessageId,
    channelTitle,
    messages,
  };
}

function getChannelTitle(html: string, channelUsername: string) {
  const title = normalizeText(getMetaContent(html, "og:title"))
    .replace(/^Telegram:\s*/i, "")
    .replace(/\s+on Telegram$/i, "")
    .trim();

  if (title && !title.toLowerCase().includes("telegram")) {
    return title;
  }

  const headerTitleMatch = html.match(
    /tgme_channel_info_header_title[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/,
  );
  const headerTitle = normalizeText(stripHtml(headerTitleMatch?.[1] ?? ""));

  return headerTitle || `@${channelUsername}`;
}

function getBeforeMessageId(html: string) {
  const match = html.match(/class="tme_messages_more[^"]*"[^>]*data-before="(\d+)"/);
  const value = Number.parseInt(match?.[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function extractMessageDateTime(rawHtml: string) {
  const match = rawHtml.match(/<time[^>]+datetime=["']([^"']+)["']/);
  const value = match?.[1];

  if (!value || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return new Date(Date.parse(value)).toISOString();
}

function extractMessageText(rawHtml: string) {
  const match = rawHtml.match(
    /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );

  return normalizeText(stripHtml(match?.[1] ?? ""));
}
