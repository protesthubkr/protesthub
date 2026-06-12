import { getKoreanDateKey } from "./date-key";

export function formatShortDate(date: string) {
  const { month, day } = parseDateKey(date);
  return `${month}/${day}`;
}

export function formatKoreanDate(date: string) {
  const { year, month, day } = parseDateKey(date);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));

  return `${month}/${day} ${weekday}`;
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function formatKoreanMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(next.getUTCDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function addMonths(month: string, months: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + months, 1));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");

  return `${nextYear}-${nextMonth}`;
}

export function getMonthKey(date: string) {
  return date.slice(0, 7);
}

export function getMonthStartDate(month: string) {
  return `${month}-01`;
}

export function getNextMonthStartDate(month: string) {
  return getMonthStartDate(addMonths(month, 1));
}

export function getKoreanTodayDate() {
  return getKoreanDateKey();
}

export function formatKoreanDateTime(dateTime: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date(dateTime));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export function formatTime(time: string | null) {
  return time ?? "--:--";
}

export function compareOccurrences(
  a: { occurrenceDate: string; occurrenceStartTime: string | null },
  b: { occurrenceDate: string; occurrenceStartTime: string | null },
) {
  if (a.occurrenceDate !== b.occurrenceDate) {
    return a.occurrenceDate.localeCompare(b.occurrenceDate);
  }

  if (a.occurrenceStartTime === null && b.occurrenceStartTime === null) {
    return 0;
  }

  if (a.occurrenceStartTime === null) {
    return 1;
  }

  if (b.occurrenceStartTime === null) {
    return -1;
  }

  return a.occurrenceStartTime.localeCompare(b.occurrenceStartTime);
}
