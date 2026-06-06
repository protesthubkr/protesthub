export const KOREA_TIME_ZONE = "Asia/Seoul";

export function getKoreanDateKey(date = new Date()) {
  const parts = getKoreanDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getKoreanYear(date = new Date()) {
  return Number(getKoreanDateParts(date).year);
}

export function clampDateKeyToMin(date: string, minDate: string) {
  return date < minDate ? minDate : date;
}

export function clampMonthKeyToMin(month: string, minMonth: string) {
  return month < minMonth ? minMonth : month;
}

function getKoreanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  return {
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
  };
}
