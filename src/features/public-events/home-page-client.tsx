"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
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
import {
  buildEventHref,
  buildConditionChips,
  buildEventFilterHref,
} from "./filters";
import { useCalendarMonthData } from "./use-calendar-month-data";
import { useEventListWindow } from "./use-event-list-window";
import { useFilterOverlayLock } from "./use-filter-overlay-lock";
import { useHomeFilterState } from "./use-home-filter-state";
import { ViewModeSwitch } from "./view-mode-switch";

const CalendarMonthView = dynamic(() =>
  import("./calendar-month-view").then((module) => module.CalendarMonthView),
);

const FilterSheet = dynamic(() =>
  import("./filter-sheet").then((module) => module.FilterSheet),
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
  const pathname = usePathname();
  const [state, dispatch] = useHomeFilterState(filters);
  const [activeViewMode, setActiveViewMode] = useState(viewMode);
  const [isRoutePending, startRouteTransition] = useTransition();
  const showCalendar = useCallback(() => setActiveViewMode("calendar"), []);
  const {
    activeCalendarMonth,
    calendarError,
    calendarData,
    isCalendarLoading,
    loadCalendarMonth,
  } = useCalendarMonthData({
    filters,
    initialCalendar,
    initialMonth: calendarMonth,
    organizers,
    pathname,
    onShowCalendar: showCalendar,
  });
  const {
    dateGroups,
    hasMoreEvents,
    hasPreviousEvents,
    isLoadingMore,
    isLoadingPrevious,
    loadError,
    loadMoreRef,
    loadPreviousRef,
    loadedEvents,
  } = useEventListWindow({
    activeViewMode,
    filters,
    initialWindow,
    isFilterOpen: state.isFilterOpen,
    todayDate,
  });
  const conditionChips = useMemo(
    () => buildConditionChips(filters),
    [filters],
  );
  const isListRouteLoading = activeViewMode === "list" && isRoutePending;

  useFilterOverlayLock(state.isFilterOpen);

  function openFilter(step: FilterStep = "issue") {
    dispatch({ type: "open-filter", filters, step });
  }

  function applyFilters() {
    const href = buildEventHref({
      date: activeViewMode === "list" ? listStartDate : null,
      filters: state.draft,
      month: activeViewMode === "calendar" ? activeCalendarMonth : null,
      organizers,
      pathname,
      viewMode: activeViewMode,
    });

    startRouteTransition(() => {
      router.push(href);
    });
    window.scrollTo({ top: 0 });
    dispatch({ type: "close-filter" });
  }

  function switchToCalendar() {
    void loadCalendarMonth(activeCalendarMonth);
  }

  function switchToList() {
    setActiveViewMode("list");
    const href = buildEventFilterHref({
      filters,
      organizers,
      pathname,
    });

    startRouteTransition(() => {
      router.push(href);
    });
    window.scrollTo({ top: 0 });
  }

  function selectCalendarDate(date: string) {
    setActiveViewMode("list");
    const href = buildEventHref({
      date,
      filters,
      organizers,
      pathname,
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
            viewMode={activeViewMode}
            onCalendarClick={switchToCalendar}
            onListClick={switchToList}
          />
        </div>

        {activeViewMode === "calendar" ? (
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
            hasPreviousEvents={hasPreviousEvents}
            isLoadingMore={isLoadingMore}
            isLoadingPrevious={isLoadingPrevious}
            loadError={loadError}
            loadMoreRef={loadMoreRef}
            loadPreviousRef={loadPreviousRef}
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
