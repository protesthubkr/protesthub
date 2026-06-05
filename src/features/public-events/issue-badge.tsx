import type { CSSProperties } from "react";
import { ISSUE_BY_KEY } from "@/lib/issues";
import type { IssueKey } from "@/lib/types";

export function IssueBadge({ issue }: { issue: IssueKey }) {
  const option = ISSUE_BY_KEY[issue];

  return (
    <span
      className="issue-badge"
      style={
        {
          "--issue-bg": option.bg,
          "--issue-text": option.text,
        } as CSSProperties
      }
    >
      {option.label}
    </span>
  );
}
