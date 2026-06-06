"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { REGION_OPTIONS } from "@/lib/regions";
import type {
  EventCalendarMonth,
  EventFilters,
  EventOccurrenceWindow,
  EventViewMode,
  FilterStep,
} from "@/lib/types";
import { CalendarMonthView } from "./calendar-month-view";
import { ConditionChips } from "./condition-chips";
import { EmptyState } from "./empty-state";
import { EventTimeline } from "./event-timeline";
import { FilterSheet } from "./filter-sheet";
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
  const showCalendar = useCallback(() => setActiveViewMode("calendar"), []);
  const {
    activeCalendarMonth,
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
    isLoadingMore,
    loadMoreRef,
    loadedEvents,
  } = useEventListWindow({
    activeViewMode,
    filters,
    initialWindow,
    isFilterOpen: state.isFilterOpen,
  });
  const conditionChips = useMemo(
    () => buildConditionChips(filters),
    [filters],
  );

  useFilterOverlayLock(state.isFilterOpen);

  function openFilter(step: FilterStep = "issue") {
    dispatch({ type: "open-filter", filters, step });
  }

  function applyFilters() {
    router.push(
      buildEventHref({
        date: activeViewMode === "list" ? listStartDate : null,
        filters: state.draft,
        month: activeViewMode === "calendar" ? activeCalendarMonth : null,
        organizers,
        pathname,
        viewMode: activeViewMode,
      }),
    );
    window.scrollTo({ top: 0 });
    dispatch({ type: "close-filter" });
  }

  function switchToCalendar() {
    void loadCalendarMonth(activeCalendarMonth);
  }

  function switchToList() {
    setActiveViewMode("list");
    router.push(
      buildEventFilterHref({
        filters,
        organizers,
        pathname,
      }),
    );
    window.scrollTo({ top: 0 });
  }

  function selectCalendarDate(date: string) {
    setActiveViewMode("list");
    router.push(
      buildEventHref({
        date,
        filters,
        organizers,
        pathname,
        viewMode: "list",
      }),
    );
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
            isLoading={isCalendarLoading}
            month={activeCalendarMonth}
            todayDate={todayDate}
            onMonthChange={loadCalendarMonth}
            onSelectDate={selectCalendarDate}
          />
        ) : loadedEvents.length === 0 && !hasMoreEvents ? (
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
