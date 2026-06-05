export type EventDateFilterResult = {
  detectedDates: string[];
  ignoredAsPast: boolean;
  today: string;
};

const KOREA_TIME_ZONE = "Asia/Seoul";
const FULL_DATE_PATTERN =
  /(20\d{2})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일)?/g;
const KOREAN_MONTH_DAY_PATTERN =
  /(^|[^\d])(\d{1,2})\s*월\s*(\d{1,2})\s*(?:일)?/g;
const NUMERIC_MONTH_DAY_PATTERN =
  /(^|[^\d-])(\d{1,2})\s*[./]\s*(\d{1,2})(?![\d%])/g;

export function analyzePastEventNotice(
  text: string,
  now = new Date(),
): EventDateFilterResult {
  const today = getKoreanDateKey(now);
  const detectedDates = extractEventDateKeys(text, now);

  return {
    detectedDates,
    ignoredAsPast:
      detectedDates.length > 0 && detectedDates.every((date) => date < today),
    today,
  };
}

export function extractEventDateKeys(text: string, now = new Date()) {
  const currentYear = getKoreanYear(now);
  const dates = new Set<string>();

  for (const match of text.matchAll(FULL_DATE_PATTERN)) {
    addValidDate(dates, Number(match[1]), Number(match[2]), Number(match[3]));
  }

  for (const match of text.matchAll(KOREAN_MONTH_DAY_PATTERN)) {
    addValidDate(dates, currentYear, Number(match[2]), Number(match[3]));
  }

  for (const match of text.matchAll(NUMERIC_MONTH_DAY_PATTERN)) {
    addValidDate(dates, currentYear, Number(match[2]), Number(match[3]));
  }

  return Array.from(dates).sort();
}

export function areAllDatesPast(dateKeys: string[], now = new Date()) {
  const today = getKoreanDateKey(now);
  return dateKeys.length > 0 && dateKeys.every((date) => date < today);
}

function addValidDate(
  dates: Set<string>,
  year: number,
  month: number,
  day: number,
) {
  if (!isValidDate(year, month, day)) {
    return;
  }

  dates.add(`${year}-${pad(month)}-${pad(day)}`);
}

function isValidDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getKoreanDateKey(date: Date) {
  const parts = getKoreanDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getKoreanYear(date: Date) {
  return Number(getKoreanDateParts(date).year);
}

function getKoreanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
