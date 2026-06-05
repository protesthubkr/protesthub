import type { FilterStep } from "@/lib/types";

export const FILTER_STEP_ORDER: FilterStep[] = [
  "issue",
  "region",
  "organizer",
];

export const FILTER_STEP_LABELS: Record<FilterStep, string> = {
  issue: "의제",
  region: "지역",
  organizer: "주최",
};

export const LOAD_MORE_ROOT_MARGIN = "240px 0px";
