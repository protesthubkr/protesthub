import type { CSSProperties } from "react";
import {
  addDays,
  addMonths,
  formatKoreanMonth,
  getMonthKey,
} from "@/lib/format";
import { ISSUE_BY_KEY } from "@/lib/issues";
import type {
  EventCalendarDaySample,
  EventCalendarDaySummary,
  EventCalendarMonth,
} from "@/lib/types";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

type CalendarMonthViewProps = {
  calendar: EventCalendarMonth | null;
  isLoading: boolean;
  month: string;
  selectedDate: string | null;
  todayDate: string;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
};

export function CalendarMonthView({
  calendar,
  isLoading,
  month,
  selectedDate,
  todayDate,
  onMonthChange,
  onSelectDate,
}: CalendarMonthViewProps) {
  const summariesByDate = new Map(
    (calendar?.days ?? []).map((summary) => [summary.date, summary]),
  );
  const gridDates = getCalendarGridDates(month);

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

      <div className="calendar-grid">
        {gridDates.map((date) => {
          const summary = summariesByDate.get(date);
          const isInCurrentMonth = getMonthKey(date) === month;
          const isSelected = selectedDate === date;
          const isToday = todayDate === date;

          return (
            <button
              aria-current={isToday ? "date" : undefined}
              aria-label={buildDateCellLabel(date, summary)}
              className={[
                "calendar-day-cell",
                isInCurrentMonth ? "" : "is-outside-month",
                isToday ? "is-today" : "",
                isSelected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-date={date}
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

  return (
    <span
      className="calendar-event-sample"
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

function getCalendarGridDates(month: string) {
  const monthStartDate = `${month}-01`;
  const startOffset =
    (new Date(`${monthStartDate}T00:00:00+09:00`).getDay() + 6) % 7;
  const firstGridDate = addDays(monthStartDate, -startOffset);

  return Array.from({ length: 42 }, (_, index) =>
    addDays(firstGridDate, index),
  );
}

function buildDateCellLabel(
  date: string,
  summary: EventCalendarDaySummary | undefined,
) {
  if (!summary) {
    return `${date} 집회 없음`;
  }

  return `${date} 집회 ${summary.count}건`;
}
