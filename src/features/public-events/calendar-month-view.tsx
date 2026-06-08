import type { CSSProperties } from "react";
import { addMonths, formatKoreanMonth, getMonthKey } from "@/lib/format";
import { ISSUE_BY_KEY } from "@/lib/issues";
import type {
  EventCalendarDaySample,
  EventCalendarDaySummary,
  EventCalendarMonth,
} from "@/lib/types";
import {
  buildCalendarDateCellLabel,
  getCalendarGridDates,
  WEEKDAY_LABELS,
} from "./calendar-month-model";

type CalendarMonthViewProps = {
  calendar: EventCalendarMonth | null;
  errorMessage: string | null;
  isLoading: boolean;
  month: string;
  todayDate: string;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
};

export function CalendarMonthView({
  calendar,
  errorMessage,
  isLoading,
  month,
  todayDate,
  onMonthChange,
  onSelectDate,
}: CalendarMonthViewProps) {
  const summariesByDate = new Map(
    (calendar?.days ?? []).map((summary) => [summary.date, summary]),
  );
  const gridDates = getCalendarGridDates(month);
  const todayMonth = getMonthKey(todayDate);
  const canGoPreviousMonth = month > todayMonth;

  return (
    <section
      aria-busy={isLoading}
      aria-label={`${formatKoreanMonth(month)} 집회 캘린더`}
      className={`calendar-month-view ${isLoading ? "is-loading" : ""}`}
    >
      <div className="calendar-month-header">
        <button
          aria-label="이전 달"
          className="calendar-month-nav"
          disabled={!canGoPreviousMonth}
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          이전
        </button>
        <h2>{formatKoreanMonth(month)}</h2>
        <button
          aria-label="다음 달"
          className="calendar-month-nav"
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          다음
        </button>
      </div>

      <div aria-hidden="true" className="calendar-weekday-row">
        {WEEKDAY_LABELS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      {errorMessage ? (
        <div className="calendar-error" role="status">
          {errorMessage}
        </div>
      ) : null}

      <div className="calendar-grid">
        {gridDates.map((date) => {
          const summary = summariesByDate.get(date);
          const isInCurrentMonth = getMonthKey(date) === month;
          const isPastDate = date < todayDate;
          const isToday = todayDate === date;

          return (
            <button
              aria-current={isToday ? "date" : undefined}
              aria-label={buildCalendarDateCellLabel({
                date,
                isPastDate,
                summary,
              })}
              className={[
                "calendar-day-cell",
                isInCurrentMonth ? "" : "is-outside-month",
                isPastDate ? "is-past-date" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-date={date}
              disabled={isPastDate}
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
            >
              <span className="calendar-day-number">
                {Number(date.slice(8, 10))}
              </span>
              {summary ? <DaySummary summary={summary} /> : null}
            </button>
          );
        })}
      </div>

      <p className="calendar-contact">
        정보 제보/수정 요청{" "}
        <a href="mailto:badplankr@gmail.com">badplankr@gmail.com</a>
      </p>
    </section>
  );
}

function DaySummary({ summary }: { summary: EventCalendarDaySummary }) {
  return (
    <span className="calendar-day-events">
      {summary.samples.map((sample) => (
        <SampleLine
          key={`${sample.id}-${sample.time ?? "undecided"}`}
          sample={sample}
        />
      ))}
      {summary.overflowCount > 0 ? (
        <span className="calendar-event-overflow">
          외 {summary.overflowCount}건
        </span>
      ) : null}
    </span>
  );
}

function SampleLine({ sample }: { sample: EventCalendarDaySample }) {
  const issue = ISSUE_BY_KEY[sample.primaryIssue];
  const shouldCenterTitle = sample.title.length <= 10;

  return (
    <span
      className={`calendar-event-sample ${
        shouldCenterTitle ? "is-short-title" : ""
      }`}
      style={
        {
          "--sample-color": issue.primary,
        } as CSSProperties
      }
    >
      <span className="calendar-event-title">{sample.title}</span>
    </span>
  );
}
