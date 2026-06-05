import { ISSUE_OPTIONS } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";

export const STRUCTURED_EVENT_ISSUE_TAGS = ISSUE_OPTIONS.map(
  (issue) => issue.label,
);

export const STRUCTURED_EVENT_REGIONS = ["", ...REGION_OPTIONS];
