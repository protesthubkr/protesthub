import type { CSSProperties, RefObject } from "react";
import { formatKoreanDate, formatTime } from "@/lib/format";
import type { DateEventGroup } from "./event-list-model";
import { EventCard } from "./event-card";
import { LoadingState } from "./loading-state";
import type { PullLoadState } from "./use-previous-week-pull";

type EventTimelineProps = {
  dateGroups: DateEventGroup[];
  hasMoreEvents: boolean;
  isLoadingMore: boolean;
  isLoadingPrevious: boolean;
  loadError: string | null;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  pullLoadState: PullLoadState | null;
};

export function EventTimeline({
  dateGroups,
  hasMoreEvents,
  isLoadingMore,
  isLoadingPrevious,
  loadError,
  loadMoreRef,
  pullLoadState,
}: EventTimelineProps) {
  const isLoadingEmptyWindow =
    dateGroups.length === 0 && (isLoadingMore || isLoadingPrevious);

  return (
    <>
      {(isLoadingPrevious || pullLoadState) && !isLoadingEmptyWindow ? (
        <PullLoadIndicator
          isLoadingPrevious={isLoadingPrevious}
          pullLoadState={pullLoadState}
        />
      ) : null}
      {dateGroups.length > 0 ? (
        <div className="date-section-list">
          {dateGroups.map((group) => (
            <DateSection group={group} key={group.date} />
          ))}
        </div>
      ) : isLoadingEmptyWindow ? (
        <LoadingState />
      ) : loadError ? null : (
        <div className="empty-week">불러온 기간에는 집회가 없어요</div>
      )}
      {loadError ? (
        <div className="timeline-error" role="status">
          {loadError}
        </div>
      ) : null}
      {!isLoadingEmptyWindow && !loadError ? (
        <div className="load-more-sentinel" ref={loadMoreRef}>
          {isLoadingMore
            ? "다음 집회를 불러오는 중"
            : hasMoreEvents
              ? "아래로 스크롤하면 다음 일주일을 불러와요"
              : "더 불러올 집회가 없어요"}
        </div>
      ) : null}
    </>
  );
}

function PullLoadIndicator({
  isLoadingPrevious,
  pullLoadState,
}: {
  isLoadingPrevious: boolean;
  pullLoadState: PullLoadState | null;
}) {
  const mode = isLoadingPrevious
    ? "loading"
    : pullLoadState?.isReady
      ? "ready"
      : "pulling";
  const progress = isLoadingPrevious ? 1 : (pullLoadState?.progress ?? 0);
  const label = getPullLoadLabel(mode);
  const ariaLabel =
    mode === "ready"
      ? "손을 놓으면 이전 일주일을 불러옵니다"
      : mode === "loading"
        ? "이전 일주일을 불러오는 중입니다"
        : "아래로 더 당기면 이전 일주일을 불러옵니다";

  return (
    <div
      aria-label={ariaLabel}
      className={`pull-load-indicator is-${mode}`}
      role="status"
      style={
        {
          "--pull-progress": progress,
        } as CSSProperties
      }
    >
      <span aria-hidden="true" className="pull-load-mark">
        <span className="pull-load-arrow" />
      </span>
      <span className="pull-load-text">{label}</span>
    </div>
  );
}

function getPullLoadLabel(mode: "loading" | "pulling" | "ready") {
  if (mode === "loading") {
    return "불러오는 중";
  }

  if (mode === "ready") {
    return "놓으면 불러오기";
  }

  return "이전 일정";
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
