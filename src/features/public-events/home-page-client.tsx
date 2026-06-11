"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useTransition } from "react";
import { REGION_OPTIONS } from "@/lib/regions";
import type {
  EventCalendarMonth,
  EventFilters,
  EventOccurrenceWindow,
  EventViewMode,
  FilterStep,
} from "@/lib/types";
import { ConditionChips } from "./condition-chips";
import { EmptyState } from "./empty-state";
import { EventTimeline } from "./event-timeline";
import { LoadingState } from "./loading-state";
import { FilterSheet } from "./filter-sheet";
import {
  buildEventHref,
  buildConditionChips,
  buildEventFilterHref,
  hasNoEventFilters,
} from "./filters";
import { useCalendarMonthData } from "./use-calendar-month-data";
import { useEventListWindow } from "./use-event-list-window";
import { useFilterOverlayLock } from "./use-filter-overlay-lock";
import { useHomeFilterState } from "./use-home-filter-state";
import { ViewModeSwitch } from "./view-mode-switch";

const CalendarMonthView = dynamic(() =>
  import("./calendar-month-view").then((module) => module.CalendarMonthView),
);

type HomePageClientProps = {
  calendarMonth: string;
  filters: EventFilters;
  initialCalendar: EventCalendarMonth | null;
  initialWindow: EventOccurrenceWindow;
  listStartDate: string | null;
  organizers: string[];
  todayDate: string;
  viewMode: EventViewMode;
};

export function HomePageClient({
  calendarMonth,
  filters,
  initialCalendar,
  initialWindow,
  listStartDate,
  organizers,
  todayDate,
  viewMode,
}: HomePageClientProps) {
  const router = useRouter();
  const [state, dispatch] = useHomeFilterState(filters);
  const [isRoutePending, startRouteTransition] = useTransition();
  const {
    activeCalendarMonth,
    calendarError,
    calendarData,
    isCalendarLoading,
    loadCalendarMonth,
  } = useCalendarMonthData({
    filters,
    enabled: viewMode === "calendar",
    initialCalendar,
    initialMonth: calendarMonth,
    organizers,
  });
  const {
    dateGroups,
    hasMoreEvents,
    isLoadingMore,
    isLoadingPrevious,
    loadError,
    loadMoreRef,
    loadedEvents,
    pullLoadState,
  } = useEventListWindow({
    activeViewMode: viewMode,
    filters,
    initialWindow,
    isFilterOpen: state.isFilterOpen,
    todayDate,
  });
  const conditionChips = useMemo(
    () => buildConditionChips(filters),
    [filters],
  );
  const isUnfiltered = hasNoEventFilters(filters);
  const isListRouteLoading = viewMode === "list" && isRoutePending;

  useFilterOverlayLock(state.isFilterOpen);

  useEffect(() => {
    if (isUnfiltered && viewMode === "calendar") {
      void import("./calendar-month-view");
    }
  }, [isUnfiltered, viewMode]);

  function openFilter(step: FilterStep = "issue") {
    dispatch({ type: "open-filter", filters, step });
  }

  function applyFilters() {
    const href = buildEventHref({
      date: viewMode === "list" ? listStartDate : null,
      filters: state.draft,
      month: viewMode === "calendar" ? activeCalendarMonth : null,
      organizers,
      viewMode,
    });

    startRouteTransition(() => {
      router.push(href);
    });
    window.scrollTo({ top: 0 });
    dispatch({ type: "close-filter" });
  }

  function switchToCalendar() {
    const href = buildEventHref({
      filters,
      month: calendarMonth,
      organizers,
      viewMode: "calendar",
    });

    startRouteTransition(() => {
      router.push(href);
    });
    window.scrollTo({ top: 0 });
  }

  function switchToList() {
    const href = buildEventFilterHref({
      filters,
      organizers,
      viewMode: "list",
    });

    startRouteTransition(() => {
      router.push(href);
    });
    window.scrollTo({ top: 0 });
  }

  function selectCalendarDate(date: string) {
    const href = buildEventHref({
      date,
      filters,
      organizers,
      viewMode: "list",
    });

    startRouteTransition(() => {
      router.push(href);
    });
    window.scrollTo({ top: 0 });
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
          <ViewModeSwitch
            viewMode={viewMode}
            onCalendarClick={switchToCalendar}
            onListClick={switchToList}
          />
        </div>

        {viewMode === "calendar" ? (
          <CalendarMonthView
            calendar={calendarData}
            errorMessage={calendarError}
            isLoading={isCalendarLoading}
            month={activeCalendarMonth}
            todayDate={todayDate}
            onMonthChange={loadCalendarMonth}
            onSelectDate={selectCalendarDate}
          />
        ) : isListRouteLoading ? (
          <LoadingState />
        ) : loadedEvents.length === 0 && !hasMoreEvents && !loadError ? (
          <EmptyState onOpenFilter={() => openFilter("issue")} />
        ) : (
          <EventTimeline
            dateGroups={dateGroups}
            hasMoreEvents={hasMoreEvents}
            isLoadingMore={isLoadingMore}
            isLoadingPrevious={isLoadingPrevious}
            loadError={loadError}
            loadMoreRef={loadMoreRef}
            pullLoadState={pullLoadState}
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
