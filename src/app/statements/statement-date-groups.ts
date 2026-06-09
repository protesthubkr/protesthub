import type { PublicStatementFeedItem } from "@/lib/telegram-statements/public-feed";

export type StatementDateGroup = {
  dateKey: string;
  items: PublicStatementFeedItem[];
  label: string;
};

export function groupStatementItemsByDate(
  items: PublicStatementFeedItem[],
): StatementDateGroup[] {
  const groups: StatementDateGroup[] = [];
  const groupByDate = new Map<string, StatementDateGroup>();

  items.forEach((item) => {
    const dateKey = getStatementDateKey(item.messageCreatedAt);
    const existingGroup = groupByDate.get(dateKey);

    if (existingGroup) {
      existingGroup.items.push(item);
      return;
    }

    const group = {
      dateKey,
      items: [item],
      label: formatStatementDateLabel(dateKey),
    };

    groupByDate.set(dateKey, group);
    groups.push(group);
  });

  return groups;
}

function getStatementDateKey(value: string | null) {
  if (!value) {
    return "unknown";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "unknown";
}

function formatStatementDateLabel(dateKey: string) {
  if (dateKey === "unknown") {
    return "날짜 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${dateKey}T00:00:00+09:00`));
}
