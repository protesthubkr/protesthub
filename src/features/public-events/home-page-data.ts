import {
  getEventQuerySignature,
  parseEventSearchState,
} from "@/features/public-events/filters";
import type { EventViewMode } from "@/lib/types";
import {
  getPublishedOrganizerOptions,
  getPublicEventCalendarMonth,
  getPublicEventOccurrenceWindow,
} from "@/lib/events";
import { createEmptyOccurrenceWindow } from "@/lib/event-query-model";
import {
  getPublicEventDatePolicy,
  resolvePublicEventCalendarMonth,
  resolvePublicEventListFromDate,
} from "@/lib/public-event-date-policy";

export type HomeSearchParams = Record<string, string | string[] | undefined>;

export async function getPublicEventsHomePageData(
  params: HomeSearchParams,
  viewMode: EventViewMode,
) {
  const searchState = parseEventSearchState(
    toURLSearchParams(params),
    viewMode,
  );
  const { todayDate } = getPublicEventDatePolicy();
  const requestedListStartDate =
    viewMode === "list" ? searchState.date : null;
  const listStartDate = requestedListStartDate
    ? resolvePublicEventListFromDate({
        requestedDate: requestedListStartDate,
        todayDate,
      })
    : null;
  const calendarMonth = resolvePublicEventCalendarMonth({
    requestedDate: listStartDate,
    requestedMonth: searchState.month,
    todayDate,
  });
  const listFromDate = listStartDate ?? todayDate;
  const normalizedSearchState = {
    ...searchState,
    date: listStartDate,
  };

  const listWindowPromise =
    viewMode === "list"
      ? getPublicEventOccurrenceWindow({
          filters: searchState.filters,
          fromDate: listFromDate,
        })
      : Promise.resolve(createEmptyOccurrenceWindow(todayDate));
  const calendarPromise =
    viewMode === "calendar"
      ? getPublicEventCalendarMonth({
          filters: searchState.filters,
          minDate: todayDate,
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
    searchSignature: getEventQuerySignature(normalizedSearchState),
    todayDate,
    viewMode,
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
