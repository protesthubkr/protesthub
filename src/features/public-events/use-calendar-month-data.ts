"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventCalendarMonth, EventFilters } from "@/lib/types";
import { fetchEventCalendarMonth } from "./client-event-cache";
import {
  appendEventFiltersToSearchParams,
  buildEventHref,
  hasNoEventFilters,
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
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const isUnfiltered = hasNoEventFilters(filters);
  const requestIdRef = useRef(0);

  const pushCalendarHistory = useCallback(
    (nextMonth: string) => {
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
    },
    [filters, organizers, pathname],
  );

  const loadCalendarMonth = useCallback(
    async (nextMonth: string) => {
      onShowCalendar();
      setActiveCalendarMonth(nextMonth);
      setCalendarError(null);

      if (calendarData?.month === nextMonth) {
        setIsCalendarLoading(false);
        pushCalendarHistory(nextMonth);
        return;
      }

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
        setCalendarError(null);
        pushCalendarHistory(nextMonth);
      } catch {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setCalendarData(null);
        setCalendarError(
          "캘린더를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      } finally {
        if (requestIdRef.current === requestId) {
          setIsCalendarLoading(false);
        }
      }
    },
    [calendarData, filters, onShowCalendar, pushCalendarHistory],
  );

  useEffect(() => {
    if (!isUnfiltered || calendarData?.month === activeCalendarMonth) {
      return;
    }

    const params = new URLSearchParams({ month: activeCalendarMonth });
    let isCanceled = false;

    fetchEventCalendarMonth(params)
      .then((prefetchedCalendar) => {
        if (isCanceled) {
          return;
        }

        setCalendarData((currentCalendar) =>
          currentCalendar?.month === activeCalendarMonth
            ? currentCalendar
            : prefetchedCalendar,
        );
      })
      .catch(() => {
        // Background prefetch failures should not replace the explicit
        // calendar button flow, where the user can see the loading/error state.
      });

    return () => {
      isCanceled = true;
    };
  }, [activeCalendarMonth, calendarData?.month, isUnfiltered]);

  return {
    activeCalendarMonth,
    calendarError,
    calendarData,
    isCalendarLoading,
    loadCalendarMonth,
  };
}
