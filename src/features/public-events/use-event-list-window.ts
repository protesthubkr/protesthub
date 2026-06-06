"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  EventFilters,
  EventOccurrenceWindow,
  EventViewMode,
} from "@/lib/types";
import { addDays } from "@/lib/format";
import { LOAD_MORE_ROOT_MARGIN, LOAD_PREVIOUS_ROOT_MARGIN } from "./config";
import {
  groupOccurrencesByDateAndTime,
  mergeOccurrences,
} from "./event-list-model";
import { appendEventFiltersToSearchParams } from "./filters";
import { fetchEventOccurrenceWindow } from "./client-event-cache";

type UseEventListWindowProps = {
  activeViewMode: EventViewMode;
  filters: EventFilters;
  initialWindow: EventOccurrenceWindow;
  isFilterOpen: boolean;
  todayDate: string;
};

export function useEventListWindow({
  activeViewMode,
  filters,
  initialWindow,
  isFilterOpen,
  todayDate,
}: UseEventListWindowProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadPreviousRef = useRef<HTMLDivElement | null>(null);
  const previousLoadArmedRef = useRef(false);
  const pendingScrollAdjustmentRef = useRef<{
    height: number;
    scrollY: number;
  } | null>(null);
  const [loadedEvents, setLoadedEvents] = useState(initialWindow.events);
  const [windowStartDate, setWindowStartDate] = useState(
    initialWindow.windowStartDate,
  );
  const [nextFromDate, setNextFromDate] = useState(
    initialWindow.nextFromDate,
  );
  const [hasMoreEvents, setHasMoreEvents] = useState(
    initialWindow.hasMoreEvents,
  );
  const hasPreviousEvents = windowStartDate > todayDate;
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dateGroups = useMemo(
    () => groupOccurrencesByDateAndTime(loadedEvents),
    [loadedEvents],
  );

  const loadMoreEvents = useCallback(async () => {
    if (
      activeViewMode !== "list" ||
      isLoadingMore ||
      isLoadingPrevious ||
      !hasMoreEvents
    ) {
      return;
    }

    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({ from: nextFromDate });
      appendEventFiltersToSearchParams(params, filters);

      const nextWindow = await fetchEventOccurrenceWindow(params);

      setLoadedEvents((currentEvents) =>
        mergeOccurrences(currentEvents, nextWindow.events),
      );
      setNextFromDate(nextWindow.nextFromDate);
      setHasMoreEvents(nextWindow.hasMoreEvents);
    } catch {
      setLoadError(
        "다음 일정을 불러오지 못했어요. 잠시 후 화면을 새로고침해 주세요.",
      );
      setHasMoreEvents(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    activeViewMode,
    filters,
    hasMoreEvents,
    isLoadingMore,
    isLoadingPrevious,
    nextFromDate,
  ]);

  const loadPreviousEvents = useCallback(async () => {
    if (
      activeViewMode !== "list" ||
      isLoadingPrevious ||
      isLoadingMore ||
      !hasPreviousEvents
    ) {
      return;
    }

    const previousFromDate = maxDate(addDays(windowStartDate, -7), todayDate);

    if (previousFromDate >= windowStartDate) {
      return;
    }

    previousLoadArmedRef.current = false;
    pendingScrollAdjustmentRef.current = {
      height: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
    };
    setIsLoadingPrevious(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({ from: previousFromDate });
      appendEventFiltersToSearchParams(params, filters);

      const previousWindow = await fetchEventOccurrenceWindow(params);

      setLoadedEvents((currentEvents) =>
        mergeOccurrences(previousWindow.events, currentEvents),
      );
      setWindowStartDate(previousFromDate);
    } catch {
      setLoadError(
        "이전 일정을 불러오지 못했어요. 잠시 후 화면을 새로고침해 주세요.",
      );
    } finally {
      setIsLoadingPrevious(false);
    }
  }, [
    activeViewMode,
    filters,
    hasPreviousEvents,
    isLoadingMore,
    isLoadingPrevious,
    todayDate,
    windowStartDate,
  ]);

  useLayoutEffect(() => {
    const adjustment = pendingScrollAdjustmentRef.current;

    if (!adjustment) {
      return;
    }

    pendingScrollAdjustmentRef.current = null;

    const nextHeight = document.documentElement.scrollHeight;
    const heightDelta = nextHeight - adjustment.height;

    if (heightDelta !== 0) {
      window.scrollTo({ top: adjustment.scrollY + heightDelta });
    }
  }, [loadedEvents, windowStartDate]);

  useEffect(() => {
    if (
      activeViewMode !== "list" ||
      !hasPreviousEvents ||
      isFilterOpen
    ) {
      previousLoadArmedRef.current = false;
      return;
    }

    function armPreviousLoading() {
      if (window.scrollY > 180) {
        previousLoadArmedRef.current = true;
      }
    }

    armPreviousLoading();
    window.addEventListener("scroll", armPreviousLoading, { passive: true });

    return () => window.removeEventListener("scroll", armPreviousLoading);
  }, [activeViewMode, hasPreviousEvents, isFilterOpen]);

  useEffect(() => {
    const sentinel = loadPreviousRef.current;

    if (
      !sentinel ||
      activeViewMode !== "list" ||
      !hasPreviousEvents ||
      isLoadingPrevious ||
      isFilterOpen
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && previousLoadArmedRef.current) {
          void loadPreviousEvents();
        }
      },
      { rootMargin: LOAD_PREVIOUS_ROOT_MARGIN },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [
    activeViewMode,
    hasPreviousEvents,
    isFilterOpen,
    isLoadingPrevious,
    loadPreviousEvents,
  ]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;

    if (
      !sentinel ||
      activeViewMode !== "list" ||
      !hasMoreEvents ||
      isLoadingMore ||
      isLoadingPrevious ||
      isFilterOpen
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void loadMoreEvents();
        }
      },
      { rootMargin: LOAD_MORE_ROOT_MARGIN },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [
    activeViewMode,
    hasMoreEvents,
    isFilterOpen,
    isLoadingMore,
    isLoadingPrevious,
    loadMoreEvents,
  ]);

  return {
    dateGroups,
    hasMoreEvents,
    hasPreviousEvents,
    isLoadingMore,
    isLoadingPrevious,
    loadError,
    loadMoreRef,
    loadPreviousRef,
    loadedEvents,
  };
}

function maxDate(date: string, minDate: string) {
  return date > minDate ? date : minDate;
}
