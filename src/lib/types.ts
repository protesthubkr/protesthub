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
  description: string;
  venue: string;
  address: string;
  region: string;
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

export type EventOccurrence = PublicEvent & {
  occurrenceDate: string;
  occurrenceStartTime: string | null;
};

export type FilterStep = "issue" | "region" | "organizer";

export type EventFilters = {
  issues: IssueKey[];
  regions: string[];
  organizers: string[];
};
