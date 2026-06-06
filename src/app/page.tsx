import { Suspense } from "react";
import { HomePageClient } from "@/features/public-events/home-page-client";
import {
  getEventQuerySignature,
  parseEventSearchState,
} from "@/features/public-events/filters";
import {
  getPublishedOrganizerOptions,
  getPublicEventCalendarMonth,
  getPublicEventOccurrenceWindow,
} from "@/lib/events";
import { getKoreanTodayDate, getMonthKey } from "@/lib/format";
import type { EventOccurrenceWindow } from "@/lib/types";

export const revalidate = 60;

type HomeSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function Home({
  searchParams,
}: {
  searchParams: HomeSearchParams;
}) {
  const params = await searchParams;
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
      : Promise.resolve(createEmptyWindow(todayDate));
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

  return (
    <Suspense fallback={<main className="app-shell">불러오는 중</main>}>
      <HomePageClient
        calendarMonth={calendarMonth}
        filters={searchState.filters}
        initialCalendar={initialCalendar}
        initialWindow={initialWindow}
        key={getEventQuerySignature(searchState)}
        listStartDate={listStartDate}
        organizers={organizers}
        todayDate={todayDate}
        viewMode={searchState.viewMode}
      />
    </Suspense>
  );
}

function createEmptyWindow(date: string): EventOccurrenceWindow {
  return {
    events: [],
    hasMoreEvents: false,
    nextFromDate: date,
    windowEndDate: date,
    windowStartDate: date,
  };
}

function toURLSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
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
