"use client";

import { useCallback, useRef, useState } from "react";
import type { EventCalendarMonth, EventFilters } from "@/lib/types";
import { fetchEventCalendarMonth } from "./client-event-cache";
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
  const requestIdRef = useRef(0);

  const loadCalendarMonth = useCallback(
    async (nextMonth: string) => {
      onShowCalendar();
      setActiveCalendarMonth(nextMonth);
      setIsCalendarLoading(true);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        const params = new URLSearchParams({ month: nextMonth });
        appendEventFiltersToSearchParams(params, filters);

        const nextCalendar = await fetchEventCalendarMonth(params);

        if (requestIdRef.current !== requestId) {
          return;
        }

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
        if (requestIdRef.current !== requestId) {
          return;
        }

        setCalendarData(null);
      } finally {
        if (requestIdRef.current === requestId) {
          setIsCalendarLoading(false);
        }
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
