import { ISSUE_OPTIONS, getIssueLabel } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import type { EventFilters, FilterStep, IssueKey } from "@/lib/types";

export type ConditionChip = {
  label: string;
  step: FilterStep;
};

export function parseEventFilters(searchParams: URLSearchParams): EventFilters {
  return {
    issues: parseParam(searchParams, "issues").filter(isIssueKey),
    regions: parseParam(searchParams, "regions"),
    organizers: parseParam(searchParams, "organizers"),
  };
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
  const params = buildEventFilterSearchParams({ filters, organizers });
  const nextQuery = params.toString();

  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
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
  return (searchParams.get(key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isIssueKey(value: string): value is IssueKey {
  return ISSUE_OPTIONS.some((issue) => issue.key === value);
}

function getIssueKeys() {
  return ISSUE_OPTIONS.map((issue) => issue.key);
}
