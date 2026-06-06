"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EventFilters,
  EventOccurrenceWindow,
  EventViewMode,
} from "@/lib/types";
import { LOAD_MORE_ROOT_MARGIN } from "./config";
import {
  groupOccurrencesByDateAndTime,
  mergeOccurrences,
} from "./event-list-model";
import { appendEventFiltersToSearchParams } from "./filters";

type UseEventListWindowProps = {
  activeViewMode: EventViewMode;
  filters: EventFilters;
  initialWindow: EventOccurrenceWindow;
  isFilterOpen: boolean;
};

export function useEventListWindow({
  activeViewMode,
  filters,
  initialWindow,
  isFilterOpen,
}: UseEventListWindowProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [loadedEvents, setLoadedEvents] = useState(initialWindow.events);
  const [nextFromDate, setNextFromDate] = useState(
    initialWindow.nextFromDate,
  );
  const [hasMoreEvents, setHasMoreEvents] = useState(
    initialWindow.hasMoreEvents,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const dateGroups = useMemo(
    () => groupOccurrencesByDateAndTime(loadedEvents),
    [loadedEvents],
  );

  const loadMoreEvents = useCallback(async () => {
    if (activeViewMode !== "list" || isLoadingMore || !hasMoreEvents) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const params = new URLSearchParams({ from: nextFromDate });
      appendEventFiltersToSearchParams(params, filters);

      const response = await fetch(`/api/events?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to load event occurrences.");
      }

      const nextWindow = (await response.json()) as EventOccurrenceWindow;

      setLoadedEvents((currentEvents) =>
        mergeOccurrences(currentEvents, nextWindow.events),
      );
      setNextFromDate(nextWindow.nextFromDate);
      setHasMoreEvents(nextWindow.hasMoreEvents);
    } catch {
      setHasMoreEvents(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeViewMode, filters, hasMoreEvents, isLoadingMore, nextFromDate]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;

    if (
      !sentinel ||
      activeViewMode !== "list" ||
      !hasMoreEvents ||
      isLoadingMore ||
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
    loadMoreEvents,
  ]);

  return {
    dateGroups,
    hasMoreEvents,
    isLoadingMore,
    loadMoreRef,
    loadedEvents,
  };
}
