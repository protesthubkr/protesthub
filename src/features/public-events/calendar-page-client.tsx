"use client";

import type { EventCalendarMonth, EventFilters } from "@/lib/types";
import { CalendarMonthView } from "./calendar-month-view";
import { buildEventHref } from "./filters";
import { PublicEventPageShell } from "./public-event-page-shell";
import { useCalendarMonthData } from "./use-calendar-month-data";

type CalendarPageClientProps = {
  calendarMonth: string;
  filters: EventFilters;
  initialCalendar: EventCalendarMonth | null;
  organizers: string[];
  todayDate: string;
};

export function CalendarPageClient({
  calendarMonth,
  filters,
  initialCalendar,
  organizers,
  todayDate,
}: CalendarPageClientProps) {
  const {
    activeCalendarMonth,
    calendarError,
    calendarData,
    isCalendarLoading,
    loadCalendarMonth,
  } = useCalendarMonthData({
    filters,
    enabled: true,
    initialCalendar,
    initialMonth: calendarMonth,
    organizers,
  });

  return (
    <PublicEventPageShell
      currentMonth={activeCalendarMonth}
      filters={filters}
      organizers={organizers}
      viewMode="calendar"
    >
      {({ navigate }) => (
        <CalendarMonthView
          calendar={calendarData}
          errorMessage={calendarError}
          isLoading={isCalendarLoading}
          month={activeCalendarMonth}
          todayDate={todayDate}
          onMonthChange={loadCalendarMonth}
          onSelectDate={(date) =>
            navigate(
              buildEventHref({
                date,
                filters,
                organizers,
                viewMode: "list",
              }),
            )
          }
        />
      )}
    </PublicEventPageShell>
  );
}
