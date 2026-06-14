export type IssueKey =
  | "labor"
  | "environment"
  | "women"
  | "gender"
  | "disability"
  | "housing"
  | "peace"
  | "party";

export type EventStatus = "published" | "canceled";

export type EventDate = {
  date: string;
  startTime: string | null;
};

export type PublicEvent = {
  id: string;
  title: string;
  venue: string;
  address: string;
  region: string;
  organizerName?: string;
  sourceAccountName: string;
  sourcePostUrl: string;
  cancelSourceUrl?: string;
  issueTags: IssueKey[];
  primaryIssue: IssueKey;
  status: EventStatus;
  lastCheckedAt: string;
  posterImageUrl?: string;
  dates: EventDate[];
};

export type EventListOccurrence = {
  id: string;
  title: string;
  venue: string;
  region: string;
  organizerName?: string;
  sourceAccountName: string;
  issueTags: IssueKey[];
  primaryIssue: IssueKey;
  occurrenceDate: string;
  occurrenceStartTime: string | null;
};

export type EventOccurrenceWindow = {
  events: EventListOccurrence[];
  hasMoreEvents: boolean;
  nextFromDate: string;
  windowEndDate: string;
  windowStartDate: string;
};

export type EventViewMode = "list" | "calendar";

export type EventCalendarDaySample = {
  id: string;
  primaryIssue: IssueKey;
  time: string | null;
  title: string;
};

export type EventCalendarDaySummary = {
  count: number;
  date: string;
  overflowCount: number;
  samples: EventCalendarDaySample[];
};

export type EventCalendarMonth = {
  days: EventCalendarDaySummary[];
  month: string;
  monthStartDate: string;
  nextMonthStartDate: string;
};

export type FilterStep = "issue" | "region" | "organizer";

export type EventFilters = {
  issues: IssueKey[];
  regions: string[];
  organizers: string[];
};
