import type { TelegramMessageLink } from "./manual-link-types";

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
