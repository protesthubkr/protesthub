import { addDays } from "@/lib/format";
import type { EventCalendarDaySummary } from "@/lib/types";

export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function getCalendarGridDates(month: string) {
  const monthStartDate = `${month}-01`;
  const startOffset =
    (new Date(`${monthStartDate}T00:00:00+09:00`).getDay() + 6) % 7;
  const firstGridDate = addDays(monthStartDate, -startOffset);

  return Array.from({ length: 42 }, (_, index) =>
    addDays(firstGridDate, index),
  );
}

export function buildCalendarDateCellLabel({
  date,
  isPastDate,
  summary,
}: {
  date: string;
  isPastDate: boolean;
  summary: EventCalendarDaySummary | undefined;
}) {
  const statusLabel = isPastDate ? "지난 날짜, " : "";

  if (!summary) {
    return `${date} ${statusLabel}집회 없음`;
  }

  return `${date} ${statusLabel}집회 ${summary.count}건`;
}
