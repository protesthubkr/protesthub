"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ISSUE_BY_KEY, ISSUE_OPTIONS, getIssueLabel } from "@/lib/issues";
import {
  addDays,
  compareOccurrences,
  getKoreanTodayDate,
  formatShortDate,
  formatTime,
} from "@/lib/format";
import type {
  EventFilters,
  EventOccurrence,
  FilterStep,
  IssueKey,
} from "@/lib/types";

type HomePageClientProps = {
  events: EventOccurrence[];
};

type TimeEventGroup = {
  time: string | null;
  events: EventOccurrence[];
};

const STEP_ORDER: FilterStep[] = ["issue", "region", "organizer"];

const STEP_LABELS: Record<FilterStep, string> = {
  issue: "의제",
  region: "지역",
  organizer: "주최",
};

const INITIAL_VISIBLE_WEEKS = 1;
const DAYS_PER_WEEK = 7;

const REGION_OPTIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];

export function HomePageClient({ events }: HomePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const [draft, setDraft] = useState<EventFilters>(filters);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<FilterStep>("issue");
  const [loadedRange, setLoadedRange] = useState({
    signature: "",
    visibleWeeks: INITIAL_VISIBLE_WEEKS,
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const todayDate = useMemo(() => getKoreanTodayDate(), []);

  const filterSignature = useMemo(
    () =>
      [
        filters.issues.join("|"),
        filters.regions.join("|"),
        filters.organizers.join("|"),
      ].join("::"),
    [filters],
  );

  const visibleWeeks =
    loadedRange.signature === filterSignature
      ? loadedRange.visibleWeeks
      : INITIAL_VISIBLE_WEEKS;

  const organizers = useMemo(
    () =>
      Array.from(new Set(events.map((event) => event.sourceAccountName))).sort(
        (a, b) => a.localeCompare(b, "ko"),
      ),
    [events],
  );

  const activeStartDate = todayDate;
  const loadedEndDate = addDays(
    activeStartDate,
    visibleWeeks * DAYS_PER_WEEK,
  );
  const baseFilteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        const matchesIssue =
          filters.issues.length === 0 ||
          filters.issues.some((issue) => event.issueTags.includes(issue));
        const matchesRegion =
          filters.regions.length === 0 || filters.regions.includes(event.region);
        const matchesOrganizer =
          filters.organizers.length === 0 ||
          filters.organizers.includes(event.sourceAccountName);

        return matchesIssue && matchesRegion && matchesOrganizer;
      })
      .sort(compareOccurrences);
  }, [events, filters]);

  const filteredEvents = useMemo(() => {
    return baseFilteredEvents.filter(
      (event) =>
        event.occurrenceDate >= activeStartDate &&
        event.occurrenceDate < loadedEndDate,
    );
  }, [activeStartDate, baseFilteredEvents, loadedEndDate]);

  const hasMoreEvents = useMemo(() => {
    return baseFilteredEvents.some(
      (event) => event.occurrenceDate >= loadedEndDate,
    );
  }, [baseFilteredEvents, loadedEndDate]);

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce(
      (groups, event) => {
        const dateGroups = groups[event.occurrenceDate] ?? [];
        const currentTimeGroup = dateGroups[dateGroups.length - 1];

        if (currentTimeGroup?.time === event.occurrenceStartTime) {
          currentTimeGroup.events.push(event);
        } else {
          dateGroups.push({
            time: event.occurrenceStartTime,
            events: [event],
          });
        }

        groups[event.occurrenceDate] = dateGroups;
        return groups;
      },
      {} as Record<string, TimeEventGroup[]>,
    );
  }, [filteredEvents]);

  const conditionChips = useMemo(
    () => buildConditionChips(filters),
    [filters],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("filter-open", isFilterOpen);
    document.body.classList.toggle("filter-open", isFilterOpen);

    return () => {
      document.documentElement.classList.remove("filter-open");
      document.body.classList.remove("filter-open");
    };
  }, [isFilterOpen]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;

    if (!sentinel || !hasMoreEvents || isFilterOpen) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadedRange((current) => {
            const currentWeeks =
              current.signature === filterSignature
                ? current.visibleWeeks
                : INITIAL_VISIBLE_WEEKS;

            return {
              signature: filterSignature,
              visibleWeeks: currentWeeks + 1,
            };
          });
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [filterSignature, hasMoreEvents, isFilterOpen, visibleWeeks]);

  function openFilter(step: FilterStep = "issue") {
    setDraft(filters);
    setActiveStep(step);
    setIsFilterOpen(true);
  }

  function applyFilters(nextFilters: EventFilters) {
    const params = new URLSearchParams();
    if (
      nextFilters.issues.length > 0 &&
      nextFilters.issues.length < ISSUE_OPTIONS.length
    ) {
      params.set("issues", nextFilters.issues.join(","));
    }
    if (
      nextFilters.regions.length > 0 &&
      nextFilters.regions.length < REGION_OPTIONS.length
    ) {
      params.set("regions", nextFilters.regions.join(","));
    }
    if (
      nextFilters.organizers.length > 0 &&
      nextFilters.organizers.length < organizers.length
    ) {
      params.set("organizers", nextFilters.organizers.join(","));
    }

    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    setIsFilterOpen(false);
  }

  function updateDraftList<K extends "issues" | "regions" | "organizers">(
    key: K,
    value: EventFilters[K][number],
  ) {
    setDraft((current) => {
      const values = current[key] as string[];
      const nextValues = values.includes(value as string)
        ? values.filter((item) => item !== value)
        : [...values, value as string];

      return {
        ...current,
        [key]: nextValues,
      };
    });
  }

  function toggleAllIssues() {
    setDraft((current) => ({
      ...current,
      issues:
        current.issues.length === ISSUE_OPTIONS.length
          ? []
          : ISSUE_OPTIONS.map((issue) => issue.key),
    }));
  }

  function toggleAllRegions() {
    setDraft((current) => ({
      ...current,
      regions:
        current.regions.length === REGION_OPTIONS.length
          ? []
          : [...REGION_OPTIONS],
    }));
  }

  function toggleAllOrganizers() {
    setDraft((current) => ({
      ...current,
      organizers:
        organizers.length > 0 && current.organizers.length === organizers.length
          ? []
          : [...organizers],
    }));
  }

  return (
    <main className="app-shell">
      <section
        className={`results-screen ${isFilterOpen ? "is-background-hidden" : ""}`}
        aria-hidden={isFilterOpen}
        aria-label="집회 목록"
      >
        <div className="results-top">
          <div className="condition-chip-row" aria-label="선택한 조건">
            {conditionChips.map((chip) => (
              <button
                key={`${chip.step}-${chip.label}`}
                className="condition-chip"
                type="button"
                onClick={() => openFilter(chip.step)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {filteredEvents.length === 0 && !hasMoreEvents ? (
          <EmptyState onOpenFilter={() => openFilter("issue")} />
        ) : (
          <>
            {filteredEvents.length === 0 ? (
              <div className="empty-week">불러온 기간에는 집회가 없어요</div>
            ) : (
              <div className="date-section-list">
                {Object.entries(groupedEvents).map(([date, timeGroups]) => {
                  const dateEventCount = timeGroups.reduce(
                    (count, group) => count + group.events.length,
                    0,
                  );

                  return (
                    <section className="date-section" key={date}>
                      <h2 className="date-section-header">
                        <span>{formatShortDate(date)}</span>{" "}
                        <span>{dateEventCount}건</span>
                      </h2>
                      <div className="time-group-list">
                        {timeGroups.map((group) => (
                          <section
                            className="time-group"
                            key={`${date}-${group.time ?? "undecided"}`}
                          >
                            <div className="time-group-label">
                              {formatTime(group.time)}
                            </div>
                            <div className="event-card-list">
                              {group.events.map((event) => (
                                <EventCard
                                  key={`${event.id}-${date}-${group.time ?? "undecided"}`}
                                  event={event}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            <div className="load-more-sentinel" ref={loadMoreRef}>
              {hasMoreEvents
                ? "아래로 스크롤하면 다음 일주일을 불러와요"
                : "더 불러올 집회가 없어요"}
            </div>
          </>
        )}
        <button
          className="filter-icon-button"
          type="button"
          aria-label="필터 열기"
          onClick={() => openFilter("issue")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/filter.svg" alt="" aria-hidden="true" />
        </button>
      </section>

      {isFilterOpen ? (
        <FilterSheet
          activeStep={activeStep}
          draft={draft}
          organizers={organizers}
          regions={REGION_OPTIONS}
          onApply={() => applyFilters(draft)}
          onClose={() => setIsFilterOpen(false)}
          onStepChange={setActiveStep}
          onToggleAllIssues={toggleAllIssues}
          onToggleAllOrganizers={toggleAllOrganizers}
          onToggleAllRegions={toggleAllRegions}
          onToggleIssue={(issue) => updateDraftList("issues", issue)}
          onToggleOrganizer={(organizer) =>
            updateDraftList("organizers", organizer)
          }
          onToggleRegion={(region) => updateDraftList("regions", region)}
        />
      ) : null}
    </main>
  );
}

function parseFilters(searchParams: URLSearchParams): EventFilters {
  return {
    issues: parseParam(searchParams, "issues").filter(isIssueKey),
    regions: parseParam(searchParams, "regions"),
    organizers: parseParam(searchParams, "organizers"),
  };
}

function parseParam(searchParams: URLSearchParams, key: string) {
  return (searchParams.get(key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isIssueKey(value: string): value is IssueKey {
  return ISSUE_OPTIONS.some((issue) => issue.key === value);
}

function buildConditionChips(filters: EventFilters) {
  const chips: { label: string; step: FilterStep }[] = [];

  if (filters.issues.length === 0) {
    chips.push({ label: "의제 전체", step: "issue" });
  } else {
    filters.issues.forEach((issue) => {
      chips.push({ label: getIssueLabel(issue), step: "issue" });
    });
  }

  if (filters.regions.length === 0) {
    chips.push({ label: "지역 전체", step: "region" });
  } else {
    filters.regions.forEach((region) => {
      chips.push({ label: region, step: "region" });
    });
  }

  filters.organizers.forEach((organizer) => {
    chips.push({ label: organizer, step: "organizer" });
  });

  return chips;
}

function FilterSheet({
  activeStep,
  draft,
  organizers,
  regions,
  onApply,
  onClose,
  onStepChange,
  onToggleAllIssues,
  onToggleAllOrganizers,
  onToggleAllRegions,
  onToggleIssue,
  onToggleOrganizer,
  onToggleRegion,
}: {
  activeStep: FilterStep;
  draft: EventFilters;
  organizers: string[];
  regions: string[];
  onApply: () => void;
  onClose: () => void;
  onStepChange: (step: FilterStep) => void;
  onToggleAllIssues: () => void;
  onToggleAllOrganizers: () => void;
  onToggleAllRegions: () => void;
  onToggleIssue: (issue: IssueKey) => void;
  onToggleOrganizer: (organizer: string) => void;
  onToggleRegion: (region: string) => void;
}) {
  return (
    <div className="filter-backdrop" role="presentation" onClick={onClose}>
      <section
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="집회 필터"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="filter-sheet-header">
          <button type="button" onClick={onClose}>
            닫기
          </button>
          <h1>필터</h1>
          <button type="button" onClick={onApply}>
            적용
          </button>
        </div>

        <div className="filter-content">
          {activeStep === "issue" ? (
            <FilterPanel
              title="관심 의제를 골라주세요"
              columns={2}
            >
              <ChoiceButton
                checked={draft.issues.length === ISSUE_OPTIONS.length}
                fullWidth
                label="전체"
                onToggle={onToggleAllIssues}
              />
              {ISSUE_OPTIONS.map((issue) => (
                <ChoiceButton
                  key={issue.key}
                  checked={draft.issues.includes(issue.key)}
                  label={issue.label}
                  onToggle={() => onToggleIssue(issue.key)}
                />
              ))}
            </FilterPanel>
          ) : null}

          {activeStep === "region" ? (
            <FilterPanel
              title="지역을 골라주세요"
              columns={2}
            >
              <ChoiceButton
                checked={draft.regions.length === regions.length}
                fullWidth
                label="전체"
                onToggle={onToggleAllRegions}
              />
              {regions.map((region) => (
                <ChoiceButton
                  key={region}
                  checked={draft.regions.includes(region)}
                  label={region}
                  onToggle={() => onToggleRegion(region)}
                />
              ))}
            </FilterPanel>
          ) : null}

          {activeStep === "organizer" ? (
            <FilterPanel
              title="주최 단체를 골라주세요"
            >
              <ChoiceButton
                checked={
                  organizers.length > 0 &&
                  draft.organizers.length === organizers.length
                }
                label="전체"
                onToggle={onToggleAllOrganizers}
              />
              {organizers.map((organizer) => (
                <ChoiceButton
                  key={organizer}
                  checked={draft.organizers.includes(organizer)}
                  label={organizer}
                  onToggle={() => onToggleOrganizer(organizer)}
                />
              ))}
            </FilterPanel>
          ) : null}
        </div>

        <div className="step-tabs" role="tablist" aria-label="필터 단계">
          {STEP_ORDER.map((step) => (
            <button
              key={step}
              className={`step-tab ${activeStep === step ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeStep === step}
              onClick={() => onStepChange(step)}
            >
              {STEP_LABELS[step]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FilterPanel({
  title,
  children,
  columns = 1,
}: {
  title: string;
  children: React.ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <div className="filter-panel">
      <div className="filter-panel-heading">
        <h2>{title}</h2>
      </div>
      <div className={`choice-list ${columns === 2 ? "is-two-column" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function ChoiceButton({
  checked,
  fullWidth = false,
  label,
  onToggle,
}: {
  checked: boolean;
  fullWidth?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={`choice-button ${checked ? "is-selected" : ""} ${
        fullWidth ? "is-full-width" : ""
      }`}
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

function EventCard({ event }: { event: EventOccurrence }) {
  const primaryIssue = ISSUE_BY_KEY[event.primaryIssue];

  return (
    <Link
      className="event-card"
      href={`/events/${event.id}`}
      style={
        {
          "--event-accent": primaryIssue.primary,
        } as React.CSSProperties
      }
    >
      <h3 className="event-title">{event.title}</h3>
      <dl className="event-meta-list">
        <div>
          <dt>주최</dt>
          <dd>{event.sourceAccountName}</dd>
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

function IssueBadge({ issue }: { issue: IssueKey }) {
  const option = ISSUE_BY_KEY[issue];

  return (
    <span
      className="issue-badge"
      style={
        {
          "--issue-bg": option.bg,
          "--issue-text": option.text,
        } as React.CSSProperties
      }
    >
      {option.label}
    </span>
  );
}

function EmptyState({ onOpenFilter }: { onOpenFilter: () => void }) {
  return (
    <div className="empty-state">
      <h2>해당 조건에 맞는 집회가 없어요</h2>
      <p>필터를 다시 조정해보세요</p>
      <button type="button" onClick={onOpenFilter}>
        필터 열기
      </button>
    </div>
  );
}
