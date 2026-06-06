import {
  clampDateKeyToMin,
  clampMonthKeyToMin,
} from "./date-key";
import { addDays, getKoreanTodayDate, getMonthKey } from "./format";

export const PUBLIC_EVENT_WINDOW_DAYS = 7;

export type PublicEventDatePolicy = {
  todayDate: string;
};

export function getPublicEventDatePolicy(): PublicEventDatePolicy {
  return {
    todayDate: getKoreanTodayDate(),
  };
}

export function resolvePublicEventListFromDate({
  requestedDate,
  todayDate,
}: {
  requestedDate: string | null;
  todayDate: string;
}) {
  return clampDateKeyToMin(requestedDate ?? todayDate, todayDate);
}

export function resolvePublicEventCalendarMonth({
  requestedDate,
  requestedMonth,
  todayDate,
}: {
  requestedDate: string | null;
  requestedMonth: string | null;
  todayDate: string;
}) {
  const todayMonth = getMonthKey(todayDate);
  const nextMonth = requestedMonth ?? getMonthKey(requestedDate ?? todayDate);

  return clampMonthKeyToMin(nextMonth, todayMonth);
}

export function getPreviousPublicEventWindowStartDate({
  todayDate,
  windowStartDate,
}: {
  todayDate: string;
  windowStartDate: string;
}) {
  return clampDateKeyToMin(
    addDays(windowStartDate, -PUBLIC_EVENT_WINDOW_DAYS),
    todayDate,
  );
}
