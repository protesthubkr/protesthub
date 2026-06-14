import type { CSSProperties } from "react";
import Link from "next/link";
import { ISSUE_BY_KEY } from "@/lib/issues";
import type { EventListOccurrence } from "@/lib/types";
import { IssueBadge } from "./issue-badge";

export function EventCard({ event }: { event: EventListOccurrence }) {
  const primaryIssue = ISSUE_BY_KEY[event.primaryIssue];
  const organizerLabel = event.organizerName ? "주최" : "출처";
  const organizerDisplayName = event.organizerName ?? event.sourceAccountName;

  return (
    <Link
      aria-label={`${event.title} 상세 보기`}
      className="event-card"
      href={`/events/${event.id}`}
      prefetch={false}
      style={
        {
          "--event-accent": primaryIssue.primary,
        } as CSSProperties
      }
    >
      <div className="event-card-heading">
        <h3 className="event-title">{event.title}</h3>
        <span className="event-card-indicator" aria-hidden="true" />
      </div>
      <dl className="event-meta-list">
        <div>
          <dt>{organizerLabel}</dt>
          <dd>{organizerDisplayName}</dd>
        </div>
        <div>
          <dt>장소</dt>
          <dd>{event.venue}</dd>
        </div>
      </dl>
      <div className="issue-badge-list">
        {event.issueTags.map((issue) => (
          <IssueBadge key={issue} issue={issue} />
        ))}
      </div>
    </Link>
  );
}
