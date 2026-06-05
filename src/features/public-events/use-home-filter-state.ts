"use client";

import { useReducer } from "react";
import { ISSUE_OPTIONS } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import type { EventFilters, FilterStep, IssueKey } from "@/lib/types";
import { toggleAllFilterValues, toggleFilterValue } from "./filters";

type HomeFilterState = {
  activeStep: FilterStep;
  draft: EventFilters;
  isFilterOpen: boolean;
};

type HomeFilterAction =
  | {
      type: "open-filter";
      filters: EventFilters;
      step: FilterStep;
    }
  | { type: "close-filter" }
  | { type: "set-step"; step: FilterStep }
  | { type: "toggle-issue"; issue: IssueKey }
  | { type: "toggle-region"; region: string }
  | { type: "toggle-organizer"; organizer: string }
  | { type: "toggle-all-issues" }
  | { type: "toggle-all-regions" }
  | { type: "toggle-all-organizers"; organizers: string[] };

export function useHomeFilterState(filters: EventFilters) {
  return useReducer(homeFilterReducer, filters, createInitialState);
}

function createInitialState(filters: EventFilters): HomeFilterState {
  return {
    activeStep: "issue",
    draft: filters,
    isFilterOpen: false,
  };
}

function homeFilterReducer(
  state: HomeFilterState,
  action: HomeFilterAction,
): HomeFilterState {
  switch (action.type) {
    case "open-filter":
      return {
        ...state,
        activeStep: action.step,
        draft: action.filters,
        isFilterOpen: true,
      };
    case "close-filter":
      return {
        ...state,
        isFilterOpen: false,
      };
    case "set-step":
      return {
        ...state,
        activeStep: action.step,
      };
    case "toggle-issue":
      return {
        ...state,
        draft: {
          ...state.draft,
          issues: toggleFilterValue(state.draft.issues, action.issue),
        },
      };
    case "toggle-region":
      return {
        ...state,
        draft: {
          ...state.draft,
          regions: toggleFilterValue(state.draft.regions, action.region),
        },
      };
    case "toggle-organizer":
      return {
        ...state,
        draft: {
          ...state.draft,
          organizers: toggleFilterValue(
            state.draft.organizers,
            action.organizer,
          ),
        },
      };
    case "toggle-all-issues":
      return {
        ...state,
        draft: {
          ...state.draft,
          issues: toggleAllFilterValues(
            state.draft.issues,
            ISSUE_OPTIONS.map((issue) => issue.key),
          ),
        },
      };
    case "toggle-all-regions":
      return {
        ...state,
        draft: {
          ...state.draft,
          regions: toggleAllFilterValues(state.draft.regions, REGION_OPTIONS),
        },
      };
    case "toggle-all-organizers":
      return {
        ...state,
        draft: {
          ...state.draft,
          organizers: toggleAllFilterValues(
            state.draft.organizers,
            action.organizers,
          ),
        },
      };
  }
}
