import type { RefObject } from "react";
import { formatKoreanDate, formatTime } from "@/lib/format";
import type { DateEventGroup } from "./event-list-model";
import { EventCard } from "./event-card";

type EventTimelineProps = {
  dateGroups: DateEventGroup[];
  hasMoreEvents: boolean;
  hasPreviousEvents: boolean;
  isLoadingMore: boolean;
  isLoadingPrevious: boolean;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  loadPreviousRef: RefObject<HTMLDivElement | null>;
};

export function EventTimeline({
  dateGroups,
  hasMoreEvents,
  hasPreviousEvents,
  isLoadingMore,
  isLoadingPrevious,
  loadMoreRef,
  loadPreviousRef,
}: EventTimelineProps) {
  return (
    <>
      {hasPreviousEvents || isLoadingPrevious ? (
        <div className="load-previous-sentinel" ref={loadPreviousRef}>
          {isLoadingPrevious
            ? "이전 집회를 불러오는 중"
            : "위로 스크롤하면 이전 일주일을 불러와요"}
        </div>
      ) : null}
      {dateGroups.length > 0 ? (
        <div className="date-section-list">
          {dateGroups.map((group) => (
            <DateSection group={group} key={group.date} />
          ))}
        </div>
      ) : (
        <div className="empty-week">불러온 기간에는 집회가 없어요</div>
      )}
      <div className="load-more-sentinel" ref={loadMoreRef}>
        {isLoadingMore
          ? "다음 집회를 불러오는 중"
          : hasMoreEvents
            ? "아래로 스크롤하면 다음 일주일을 불러와요"
            : "더 불러올 집회가 없어요"}
      </div>
    </>
  );
}

function DateSection({ group }: { group: DateEventGroup }) {
  return (
    <section
      aria-label={`${formatKoreanDate(group.date)} 집회 ${group.eventCount}건`}
      className="date-section"
    >
      <h2 className="date-section-header">
        <span>{formatKoreanDate(group.date)}</span>{" "}
        <span>{group.eventCount}건</span>
      </h2>
      <div className="time-group-list">
        {group.timeGroups.map((timeGroup) => (
          <section
            className="time-group"
            key={`${group.date}-${timeGroup.time ?? "undecided"}`}
          >
            <div className="time-group-label">{formatTime(timeGroup.time)}</div>
            <div className="event-card-list">
              {timeGroup.events.map((event) => (
                <EventCard
                  event={event}
                  key={`${event.id}-${group.date}-${timeGroup.time ?? "undecided"}`}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
