"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compareOccurrences } from "@/lib/format";
import { REGION_OPTIONS } from "@/lib/regions";
import type {
  EventFilters,
  EventListOccurrence,
  EventOccurrenceWindow,
  FilterStep,
} from "@/lib/types";
import { LOAD_MORE_ROOT_MARGIN } from "./config";
import { ConditionChips } from "./condition-chips";
import { EmptyState } from "./empty-state";
import { groupOccurrencesByDateAndTime } from "./event-list-model";
import { EventTimeline } from "./event-timeline";
import { FilterSheet } from "./filter-sheet";
import {
  appendEventFiltersToSearchParams,
  buildConditionChips,
  buildEventFilterHref,
} from "./filters";
import { useHomeFilterState } from "./use-home-filter-state";

type HomePageClientProps = {
  filters: EventFilters;
  initialWindow: EventOccurrenceWindow;
  organizers: string[];
};

export function HomePageClient({
  filters,
  initialWindow,
  organizers,
}: HomePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, dispatch] = useHomeFilterState(filters);
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
  const conditionChips = useMemo(
    () => buildConditionChips(filters),
    [filters],
  );

  useEffect(() => {
    document.documentElement.classList.toggle(
      "filter-open",
      state.isFilterOpen,
    );
    document.body.classList.toggle("filter-open", state.isFilterOpen);

    return () => {
      document.documentElement.classList.remove("filter-open");
      document.body.classList.remove("filter-open");
    };
  }, [state.isFilterOpen]);

  const loadMoreEvents = useCallback(async () => {
    if (isLoadingMore || !hasMoreEvents) {
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
  }, [filters, hasMoreEvents, isLoadingMore, nextFromDate]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;

    if (
      !sentinel ||
      !hasMoreEvents ||
      isLoadingMore ||
      state.isFilterOpen
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
  }, [hasMoreEvents, isLoadingMore, loadMoreEvents, state.isFilterOpen]);

  function openFilter(step: FilterStep = "issue") {
    dispatch({ type: "open-filter", filters, step });
  }

  function applyFilters() {
    router.push(
      buildEventFilterHref({
        filters: state.draft,
        organizers,
        pathname,
      }),
    );
    window.scrollTo({ top: 0 });
    dispatch({ type: "close-filter" });
  }

  return (
    <main className="app-shell">
      <section
        aria-hidden={state.isFilterOpen}
        aria-label="집회 목록"
        className={`results-screen ${
          state.isFilterOpen ? "is-background-hidden" : ""
        }`}
      >
        <div className="results-top">
          <ConditionChips chips={conditionChips} onOpenFilter={openFilter} />
        </div>

        {loadedEvents.length === 0 && !hasMoreEvents ? (
          <EmptyState onOpenFilter={() => openFilter("issue")} />
        ) : (
          <EventTimeline
            dateGroups={dateGroups}
            hasMoreEvents={hasMoreEvents}
            isLoadingMore={isLoadingMore}
            loadMoreRef={loadMoreRef}
          />
        )}

        <button
          aria-label="필터 열기"
          className="filter-icon-button"
          type="button"
          onClick={() => openFilter("issue")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/filter.svg" alt="" aria-hidden="true" />
        </button>
      </section>

      {state.isFilterOpen ? (
        <FilterSheet
          activeStep={state.activeStep}
          draft={state.draft}
          organizers={organizers}
          regions={REGION_OPTIONS}
          onApply={applyFilters}
          onClose={() => dispatch({ type: "close-filter" })}
          onStepChange={(step) => dispatch({ type: "set-step", step })}
          onToggleAllIssues={() => dispatch({ type: "toggle-all-issues" })}
          onToggleAllOrganizers={() =>
            dispatch({ type: "toggle-all-organizers", organizers })
          }
          onToggleAllRegions={() => dispatch({ type: "toggle-all-regions" })}
          onToggleIssue={(issue) => dispatch({ type: "toggle-issue", issue })}
          onToggleOrganizer={(organizer) =>
            dispatch({ type: "toggle-organizer", organizer })
          }
          onToggleRegion={(region) =>
            dispatch({ type: "toggle-region", region })
          }
        />
      ) : null}
    </main>
  );
}

function mergeOccurrences(
  currentEvents: EventListOccurrence[],
  nextEvents: EventListOccurrence[],
) {
  const eventsByKey = new Map(
    currentEvents.map((event) => [getOccurrenceKey(event), event]),
  );

  nextEvents.forEach((event) => {
    eventsByKey.set(getOccurrenceKey(event), event);
  });

  return Array.from(eventsByKey.values()).sort(compareOccurrences);
}

function getOccurrenceKey(event: EventListOccurrence) {
  return [
    event.id,
    event.occurrenceDate,
    event.occurrenceStartTime ?? "undecided",
  ].join("::");
}
