"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useTransition } from "react";
import { REGION_OPTIONS } from "@/lib/regions";
import type { EventFilters, EventViewMode, FilterStep } from "@/lib/types";
import { ConditionChips } from "./condition-chips";
import { FilterSheet } from "./filter-sheet";
import {
  buildConditionChips,
  buildEventFilterHref,
  buildEventHref,
} from "./filters";
import { useFilterOverlayLock } from "./use-filter-overlay-lock";
import { useHomeFilterState } from "./use-home-filter-state";
import { ViewModeSwitch } from "./view-mode-switch";

type PublicEventPageShellRenderContext = {
  isFilterOpen: boolean;
  isRoutePending: boolean;
  navigate: (href: string) => void;
  openFilter: (step?: FilterStep) => void;
};

type PublicEventPageShellProps = {
  children: (context: PublicEventPageShellRenderContext) => ReactNode;
  currentDate?: string | null;
  currentMonth?: string | null;
  filters: EventFilters;
  organizers: string[];
  viewMode: EventViewMode;
};

export function PublicEventPageShell({
  children,
  currentDate = null,
  currentMonth = null,
  filters,
  organizers,
  viewMode,
}: PublicEventPageShellProps) {
  const router = useRouter();
  const [state, dispatch] = useHomeFilterState(filters);
  const [isRoutePending, startRouteTransition] = useTransition();
  const conditionChips = useMemo(
    () => buildConditionChips(filters),
    [filters],
  );

  useFilterOverlayLock(state.isFilterOpen);

  function navigate(href: string) {
    startRouteTransition(() => {
      router.push(href);
    });
    window.scrollTo({ top: 0 });
  }

  function openFilter(step: FilterStep = "issue") {
    dispatch({ type: "open-filter", filters, step });
  }

  function closeFilter() {
    dispatch({ type: "close-filter" });
  }

  function applyFilters() {
    navigate(
      buildEventHref({
        date: viewMode === "list" ? currentDate : null,
        filters: state.draft,
        month: viewMode === "calendar" ? currentMonth : null,
        organizers,
        viewMode,
      }),
    );
    closeFilter();
  }

  function switchToCalendar() {
    navigate(
      buildEventHref({
        filters,
        month: currentMonth,
        organizers,
        viewMode: "calendar",
      }),
    );
  }

  function switchToList() {
    navigate(
      buildEventFilterHref({
        filters,
        organizers,
        viewMode: "list",
      }),
    );
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

        {children({
          isFilterOpen: state.isFilterOpen,
          isRoutePending,
          navigate,
          openFilter,
        })}

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
          onClose={closeFilter}
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
