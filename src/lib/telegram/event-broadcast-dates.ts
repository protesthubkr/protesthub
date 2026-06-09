import { addDays, getKoreanTodayDate } from "@/lib/format";
import type { PublicEvent } from "@/lib/types";

export function getDefaultTelegramBroadcastTargetDate() {
  return addDays(getKoreanTodayDate(), 1);
}

export function getEventForOccurrenceDate(
  event: PublicEvent,
  occurrenceDate: string,
) {
  const dates = event.dates.filter((date) => date.date === occurrenceDate);

  if (dates.length === 0) {
    throw new Error(
      `Event ${event.id} does not have occurrence date ${occurrenceDate}.`,
    );
  }

  return {
    ...event,
    dates,
  };
}

export function getNextBroadcastOccurrenceDate(event: PublicEvent) {
  const today = getKoreanTodayDate();
  const sortedDates = [...event.dates].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }

    if (a.startTime === null && b.startTime === null) {
      return 0;
    }

    if (a.startTime === null) {
      return 1;
    }

    if (b.startTime === null) {
      return -1;
    }

    return a.startTime.localeCompare(b.startTime);
  });
  const nextDate = sortedDates.find((date) => date.date >= today);

  if (nextDate) {
    return nextDate.date;
  }

  if (sortedDates[0]) {
    return sortedDates[0].date;
  }

  throw new Error(`Event ${event.id} does not have dates.`);
}
