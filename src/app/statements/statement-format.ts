import type { PublicStatementFeedItem } from "@/lib/telegram-statements/public-feed";

export function formatStatementTime(item: PublicStatementFeedItem) {
  if (item.isTimeUnknown) {
    return "--:--";
  }

  if (!item.messageCreatedAt) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(item.messageCreatedAt));
}
