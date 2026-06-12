import "server-only";

import { formatKoreanDate } from "@/lib/format";
import type { PublicEvent } from "@/lib/types";

const TELEGRAM_API_URL = "https://api.telegram.org/bot";
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;

type TelegramMethod = "sendMessage" | "sendPhoto";

type TelegramApiResponse = {
  ok: boolean;
  description?: string;
  result?: {
    message_id: number;
  };
};

type TelegramInlineKeyboardMarkup = {
  inline_keyboard: {
    text: string;
    url: string;
  }[][];
};

export type TelegramBroadcastResult = {
  method: TelegramMethod;
  messageId: number;
};

export function formatTelegramNoEventsMessage() {
  return [
    "집시캘린더 내일의 집회 브리핑 채널입니다.",
    "",
    "브리핑해드릴 내일 집회는 없지만,",
    "오늘도 안전하고 힘차게 연대해요!",
  ].join("\n");
}

export async function broadcastNoEventsToTelegram() {
  return sendTelegramMessage(formatTelegramNoEventsMessage());
}

export async function broadcastEventToTelegram(event: PublicEvent) {
  if (event.posterImageUrl) {
    return sendTelegramPhoto({
      caption: formatTelegramEventMessage(event, {
        maxLength: TELEGRAM_PHOTO_CAPTION_LIMIT,
      }),
      photoUrl: event.posterImageUrl,
      replyMarkup: getTelegramEventButtons(event),
    });
  }

  return sendTelegramMessage(formatTelegramEventMessage(event), {
    replyMarkup: getTelegramEventButtons(event),
  });
}

export async function sendTelegramMessage(
  text: string,
  options: { replyMarkup?: TelegramInlineKeyboardMarkup } = {},
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;

  if (!botToken || !chatId) {
    throw new Error(
      "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID.",
    );
  }

  const response = await fetch(
    `${TELEGRAM_API_URL}${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        disable_web_page_preview: true,
        reply_markup: options.replyMarkup,
        text: truncateTelegramMessage(text),
      }),
    },
  );

  const payload = (await response.json()) as TelegramApiResponse;

  if (!response.ok || !payload.ok || !payload.result?.message_id) {
    throw new Error(
      payload.description ?? `Telegram sendMessage failed: ${response.status}`,
    );
  }

  return {
    method: "sendMessage",
    messageId: payload.result.message_id,
  } satisfies TelegramBroadcastResult;
}

export async function sendTelegramPhoto({
  caption,
  photoUrl,
  replyMarkup,
}: {
  caption: string;
  photoUrl: string;
  replyMarkup?: TelegramInlineKeyboardMarkup;
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;

  if (!botToken || !chatId) {
    throw new Error(
      "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID.",
    );
  }

  const response = await fetch(`${TELEGRAM_API_URL}${botToken}/sendPhoto`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      caption: truncateTelegramPhotoCaption(caption),
      chat_id: chatId,
      photo: photoUrl,
      reply_markup: replyMarkup,
    }),
  });

  const payload = (await response.json()) as TelegramApiResponse;

  if (!response.ok || !payload.ok || !payload.result?.message_id) {
    throw new Error(
      payload.description ?? `Telegram sendPhoto failed: ${response.status}`,
    );
  }

  return {
    method: "sendPhoto",
    messageId: payload.result.message_id,
  } satisfies TelegramBroadcastResult;
}

export function formatTelegramEventMessage(
  event: PublicEvent,
  options: { maxLength?: number } = {},
) {
  const message = [
    event.title,
    formatTelegramDates(event),
    formatTelegramPlace(event),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return options.maxLength ? truncateText(message, options.maxLength) : message;
}

function getTelegramEventButtons(event: PublicEvent): TelegramInlineKeyboardMarkup {
  const sourceUrl = event.cancelSourceUrl ?? event.sourcePostUrl;
  const sourceLabel =
    event.status === "canceled" ? "취소 출처 보기" : "원본 보기";

  return {
    inline_keyboard: [
      [
        {
          text: "상세페이지 보기",
          url: getEventDetailUrl(event.id),
        },
      ],
      [
        {
          text: sourceLabel,
          url: sourceUrl,
        },
      ],
    ],
  };
}

function formatTelegramDates(event: PublicEvent) {
  if (event.dates.length === 0) {
    return "날짜 미정";
  }

  return event.dates
    .map(
      (date) =>
        `${formatKoreanDate(date.date)} ${formatTelegramTime(date.startTime)}`,
    )
    .join("\n");
}

function formatTelegramTime(time: string | null) {
  return time ?? "시간 미정";
}

function formatTelegramPlace(event: PublicEvent) {
  return event.venue;
}

function truncateTelegramMessage(text: string) {
  return truncateText(text, TELEGRAM_MESSAGE_LIMIT);
}

function truncateTelegramPhotoCaption(text: string) {
  return truncateText(text, TELEGRAM_PHOTO_CAPTION_LIMIT);
}

function truncateText(text: string, limit: number) {
  if (text.length <= limit) {
    return text;
  }

  if (limit <= 0) {
    return "";
  }

  if (limit === 1) {
    return "…";
  }

  return `${text.slice(0, limit - 1)}…`;
}

function getEventDetailUrl(eventId: string) {
  return `${getSiteUrl()}/events/${eventId}`;
}

function getSiteUrl() {
  const explicitSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  if (explicitSiteUrl) {
    return withProtocol(explicitSiteUrl);
  }

  if (vercelUrl) {
    return withProtocol(vercelUrl);
  }

  return "http://localhost:3000";
}

function withProtocol(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}
