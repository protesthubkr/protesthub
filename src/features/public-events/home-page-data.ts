import {
  getEventQuerySignature,
  parseEventSearchState,
} from "@/features/public-events/filters";
import {
  getPublishedOrganizerOptions,
  getPublicEventCalendarMonth,
  getPublicEventOccurrenceWindow,
} from "@/lib/events";
import { createEmptyOccurrenceWindow } from "@/lib/event-query-model";
import { getKoreanTodayDate, getMonthKey } from "@/lib/format";

export type HomeSearchParams = Record<string, string | string[] | undefined>;

export async function getPublicEventsHomePageData(params: HomeSearchParams) {
  const searchState = parseEventSearchState(toURLSearchParams(params));
  const todayDate = getKoreanTodayDate();
  const listStartDate =
    searchState.viewMode === "list" ? searchState.date : null;
  const calendarMonth =
    searchState.month ?? getMonthKey(searchState.date ?? todayDate);
  const listFromDate = listStartDate ?? todayDate;

  const listWindowPromise =
    searchState.viewMode === "list"
      ? getPublicEventOccurrenceWindow({
          filters: searchState.filters,
          fromDate: listFromDate,
        })
      : Promise.resolve(createEmptyOccurrenceWindow(todayDate));
  const calendarPromise =
    searchState.viewMode === "calendar"
      ? getPublicEventCalendarMonth({
          filters: searchState.filters,
          month: calendarMonth,
        })
      : Promise.resolve(null);

  const [initialWindow, initialCalendar, organizers] = await Promise.all([
    listWindowPromise,
    calendarPromise,
    getPublishedOrganizerOptions(),
  ]);

  return {
    calendarMonth,
    filters: searchState.filters,
    initialCalendar,
    initialWindow,
    listStartDate,
    organizers,
    searchSignature: getEventQuerySignature(searchState),
    todayDate,
    viewMode: searchState.viewMode,
  };
}

function toURLSearchParams(params: HomeSearchParams) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
      return;
    }

    if (value) {
      searchParams.set(key, value);
    }
  });

  return searchParams;
}
