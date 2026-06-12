"use client";

import type { EventFilters, EventOccurrenceWindow } from "@/lib/types";
import { EmptyState } from "./empty-state";
import { EventTimeline } from "./event-timeline";
import { LoadingState } from "./loading-state";
import { PublicEventPageShell } from "./public-event-page-shell";
import { useEventListWindow } from "./use-event-list-window";

type ListPageClientProps = {
  calendarMonth: string;
  filters: EventFilters;
  initialWindow: EventOccurrenceWindow;
  listStartDate: string | null;
  organizers: string[];
  todayDate: string;
};

export function ListPageClient({
  calendarMonth,
  filters,
  initialWindow,
  listStartDate,
  organizers,
  todayDate,
}: ListPageClientProps) {
  return (
    <PublicEventPageShell
      currentDate={listStartDate}
      currentMonth={calendarMonth}
      filters={filters}
      organizers={organizers}
      viewMode="list"
    >
      {({ isFilterOpen, isRoutePending, openFilter }) => (
        <ListPageContent
          filters={filters}
          initialWindow={initialWindow}
          isFilterOpen={isFilterOpen}
          isRoutePending={isRoutePending}
          todayDate={todayDate}
          onOpenFilter={openFilter}
        />
      )}
    </PublicEventPageShell>
  );
}

function ListPageContent({
  filters,
  initialWindow,
  isFilterOpen,
  isRoutePending,
  todayDate,
  onOpenFilter,
}: {
  filters: EventFilters;
  initialWindow: EventOccurrenceWindow;
  isFilterOpen: boolean;
  isRoutePending: boolean;
  todayDate: string;
  onOpenFilter: () => void;
}) {
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
    activeViewMode: "list",
    filters,
    initialWindow,
    isFilterOpen,
    todayDate,
  });

  if (isRoutePending) {
    return <LoadingState />;
  }

  if (loadedEvents.length === 0 && !hasMoreEvents && !loadError) {
    return <EmptyState onOpenFilter={onOpenFilter} />;
  }

  return (
    <EventTimeline
      dateGroups={dateGroups}
      hasMoreEvents={hasMoreEvents}
      isLoadingMore={isLoadingMore}
      isLoadingPrevious={isLoadingPrevious}
      loadError={loadError}
      loadMoreRef={loadMoreRef}
      pullLoadState={pullLoadState}
    />
  );
}
