import { Fragment } from "react";
import type { StatementDateGroup } from "./statement-date-groups";
import { StatementFeedRow } from "./statement-feed-row";

export function StatementFeedList({
  dateGroups,
}: {
  dateGroups: StatementDateGroup[];
}) {
  return (
    <section
      aria-label="입장문 목록"
      aria-live="polite"
      className="statement-feed-list"
      role="log"
    >
      {dateGroups.map((group) => (
        <Fragment key={group.dateKey}>
          <div className="statement-date-divider">
            <span>{group.label}</span>
          </div>
          {group.items.map((item) => (
            <StatementFeedRow item={item} key={item.id} />
          ))}
        </Fragment>
      ))}
    </section>
  );
}
