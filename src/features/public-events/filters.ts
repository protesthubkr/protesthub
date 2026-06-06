import { ISSUE_OPTIONS, getIssueLabel } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import type {
  EventFilters,
  EventViewMode,
  FilterStep,
  IssueKey,
} from "@/lib/types";

export type ConditionChip = {
  label: string;
  step: FilterStep;
};

export type EventSearchState = {
  date: string | null;
  filters: EventFilters;
  month: string | null;
  viewMode: EventViewMode;
};

export function parseEventSearchState(
  searchParams: URLSearchParams,
): EventSearchState {
  return {
    date: parseDateParam(searchParams.get("date")),
    filters: parseEventFilters(searchParams),
    month: parseMonthParam(searchParams.get("month")),
    viewMode: parseViewMode(searchParams.get("view")),
  };
}

export function parseEventFilters(searchParams: URLSearchParams): EventFilters {
  return {
    issues: parseParam(searchParams, "issues").filter(isIssueKey),
    regions: parseParam(searchParams, "regions").filter(isRegion),
    organizers: parseParam(searchParams, "organizers"),
  };
}

export function buildEventHref({
  date = null,
  filters,
  month = null,
  organizers,
  pathname,
  viewMode = "list",
}: {
  date?: string | null;
  filters: EventFilters;
  month?: string | null;
  organizers: string[];
  pathname: string;
  viewMode?: EventViewMode;
}) {
  const params = buildEventFilterSearchParams({ filters, organizers });

  if (viewMode === "calendar") {
    params.set("view", "calendar");

    if (month) {
      params.set("month", month);
    }
  } else if (date) {
    params.set("view", "list");
    params.set("date", date);
  }

  const nextQuery = params.toString();

  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function buildEventFilterHref({
  filters,
  organizers,
  pathname,
}: {
  filters: EventFilters;
  organizers: string[];
  pathname: string;
}) {
  return buildEventHref({ filters, organizers, pathname });
}

export function buildEventFilterSearchParams({
  filters,
  organizers,
}: {
  filters: EventFilters;
  organizers: string[];
}) {
  const params = new URLSearchParams();

  appendPartialSelection(params, "issues", filters.issues, getIssueKeys());
  appendPartialSelection(params, "regions", filters.regions, REGION_OPTIONS);
  appendPartialSelection(params, "organizers", filters.organizers, organizers);

  return params;
}

export function appendEventFiltersToSearchParams(
  params: URLSearchParams,
  filters: EventFilters,
) {
  appendSelection(params, "issues", filters.issues);
  appendSelection(params, "regions", filters.regions);
  appendSelection(params, "organizers", filters.organizers);
}

export function getFilterSignature(filters: EventFilters) {
  return [
    filters.issues.join("|"),
    filters.regions.join("|"),
    filters.organizers.join("|"),
  ].join("::");
}

export function getEventQuerySignature(searchState: EventSearchState) {
  return [
    getFilterSignature(searchState.filters),
    searchState.viewMode,
    searchState.month ?? "",
    searchState.date ?? "",
  ].join("::");
}

export function buildConditionChips(filters: EventFilters): ConditionChip[] {
  const chips: ConditionChip[] = [];

  if (filters.issues.length === 0) {
    chips.push({ label: "의제 전체", step: "issue" });
  } else {
    filters.issues.forEach((issue) => {
      chips.push({ label: getIssueLabel(issue), step: "issue" });
    });
  }

  if (filters.regions.length === 0) {
    chips.push({ label: "지역 전체", step: "region" });
  } else {
    filters.regions.forEach((region) => {
      chips.push({ label: region, step: "region" });
    });
  }

  filters.organizers.forEach((organizer) => {
    chips.push({ label: organizer, step: "organizer" });
  });

  return chips;
}

export function toggleFilterValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function toggleAllFilterValues<T extends string>(
  selectedValues: T[],
  allValues: readonly T[],
) {
  return selectedValues.length === allValues.length ? [] : [...allValues];
}

export function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

export function parseMonthParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const month = Number(value.slice(5, 7));

  return month >= 1 && month <= 12 ? value : null;
}

function appendPartialSelection<T extends string>(
  params: URLSearchParams,
  key: string,
  selectedValues: T[],
  allValues: readonly T[],
) {
  if (selectedValues.length > 0 && selectedValues.length < allValues.length) {
    params.set(key, selectedValues.join(","));
  }
}

function appendSelection<T extends string>(
  params: URLSearchParams,
  key: string,
  selectedValues: T[],
) {
  if (selectedValues.length > 0) {
    params.set(key, selectedValues.join(","));
  }
}

function parseParam(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function isIssueKey(value: string): value is IssueKey {
  return ISSUE_OPTIONS.some((issue) => issue.key === value);
}

function isRegion(value: string) {
  return REGION_OPTIONS.includes(value);
}

function getIssueKeys() {
  return ISSUE_OPTIONS.map((issue) => issue.key);
}

function parseViewMode(value: string | null): EventViewMode {
  return value === "calendar" ? "calendar" : "list";
}
