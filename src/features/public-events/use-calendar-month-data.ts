"use client";

import { useCallback, useState } from "react";
import type { EventCalendarMonth, EventFilters } from "@/lib/types";
import {
  appendEventFiltersToSearchParams,
  buildEventHref,
} from "./filters";

type UseCalendarMonthDataProps = {
  filters: EventFilters;
  initialCalendar: EventCalendarMonth | null;
  initialMonth: string;
  organizers: string[];
  pathname: string;
  onShowCalendar: () => void;
};

export function useCalendarMonthData({
  filters,
  initialCalendar,
  initialMonth,
  organizers,
  pathname,
  onShowCalendar,
}: UseCalendarMonthDataProps) {
  const [activeCalendarMonth, setActiveCalendarMonth] =
    useState(initialMonth);
  const [calendarData, setCalendarData] = useState(initialCalendar);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);

  const loadCalendarMonth = useCallback(
    async (nextMonth: string) => {
      onShowCalendar();
      setActiveCalendarMonth(nextMonth);
      setIsCalendarLoading(true);

      try {
        const params = new URLSearchParams({ month: nextMonth });
        appendEventFiltersToSearchParams(params, filters);

        const response = await fetch(
          `/api/events/calendar?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error("Failed to load calendar summaries.");
        }

        const nextCalendar = (await response.json()) as EventCalendarMonth;
        setCalendarData(nextCalendar);
        window.history.pushState(
          null,
          "",
          buildEventHref({
            filters,
            month: nextMonth,
            organizers,
            pathname,
            viewMode: "calendar",
          }),
        );
      } catch {
        setCalendarData(null);
      } finally {
        setIsCalendarLoading(false);
      }
    },
    [filters, onShowCalendar, organizers, pathname],
  );

  return {
    activeCalendarMonth,
    calendarData,
    isCalendarLoading,
    loadCalendarMonth,
  };
}
