import type { ReviewCandidate } from "@/lib/admin-candidates/types";
import { getIssueKeyFromValue } from "@/lib/issues";
import { REGION_OPTIONS } from "@/lib/regions";
import type { EventDate, IssueKey } from "@/lib/types";
import type { StructuredEventResult } from "./structured-event-view";

type PublishDateRow = {
  date: string;
  start_time: string;
};

type PublishFormDefaults = {
  address: string;
  dateRows: PublishDateRow[];
  issueKeys: IssueKey[];
  organizerName: string;
  posterImageUrl: string;
  primaryIssue: IssueKey | "";
  region: string;
  title: string;
  venue: string;
};

export function getPublishFormDefaults(
  candidate: ReviewCandidate,
  structuredEvent: StructuredEventResult | null,
): PublishFormDefaults {
  const issueKeys = candidate.publicEvent
    ? candidate.publicEvent.issueTags
    : getPublishIssueKeys(structuredEvent);

  return {
    address: candidate.publicEvent?.address ?? structuredEvent?.address ?? "",
    dateRows: candidate.publicEvent
      ? getPublishPublicDateRows(candidate.publicEvent.dates)
      : getPublishDateRows(structuredEvent),
    issueKeys,
    organizerName:
      candidate.publicEvent?.organizerName ??
      structuredEvent?.organizers[0]?.trim() ??
      "",
    posterImageUrl:
      candidate.publicEvent?.posterImageUrl ?? getPosterImageUrl(candidate),
    primaryIssue: candidate.publicEvent
      ? candidate.publicEvent.primaryIssue
      : getPublishPrimaryIssue(structuredEvent, issueKeys),
    region: getPublishRegion(candidate, structuredEvent),
    title: candidate.publicEvent?.title ?? structuredEvent?.title ?? "",
    venue: candidate.publicEvent?.venue ?? structuredEvent?.venue ?? "",
  };
}

export function normalizeTimeInput(value: string | undefined) {
  return value && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "";
}

function getPublishRegion(
  candidate: ReviewCandidate,
  structuredEvent: StructuredEventResult | null,
) {
  if (REGION_OPTIONS.includes(candidate.publicEvent?.region ?? "")) {
    return candidate.publicEvent?.region ?? "";
  }

  if (REGION_OPTIONS.includes(structuredEvent?.region ?? "")) {
    return structuredEvent?.region ?? "";
  }

  return "";
}

function getPublishDateRows(
  structuredEvent: StructuredEventResult | null,
): PublishDateRow[] {
  const dates = (structuredEvent?.dates ?? [])
    .map((date) => ({
      date: date.date ?? "",
      start_time: date.start_time ?? "",
    }))
    .filter((date) => date.date);

  if (dates.length === 0) {
    return [{ date: "", start_time: "" }];
  }

  return [...dates, { date: "", start_time: "" }];
}

function getPublishPublicDateRows(dates: EventDate[]): PublishDateRow[] {
  if (dates.length === 0) {
    return [{ date: "", start_time: "" }];
  }

  return [
    ...dates.map((date) => ({
      date: date.date,
      start_time: date.startTime ?? "",
    })),
    { date: "", start_time: "" },
  ];
}

function getPublishIssueKeys(structuredEvent: StructuredEventResult | null) {
  const issueKeys = (structuredEvent?.issue_tags ?? [])
    .map(getIssueKey)
    .filter((issue): issue is IssueKey => Boolean(issue));
  const primaryIssue = getIssueKey(structuredEvent?.primary_issue);

  if (primaryIssue) {
    issueKeys.unshift(primaryIssue);
  }

  return Array.from(new Set(issueKeys));
}

function getPublishPrimaryIssue(
  structuredEvent: StructuredEventResult | null,
  issueKeys: IssueKey[],
) {
  return getIssueKey(structuredEvent?.primary_issue) ?? issueKeys[0] ?? "";
}

function getIssueKey(value: string | undefined) {
  return getIssueKeyFromValue(value);
}

function getPosterImageUrl(candidate: ReviewCandidate) {
  const firstImage = candidate.media.find(
    (media) => media.url || media.previewImageUrl,
  );

  return firstImage?.url ?? firstImage?.previewImageUrl ?? "";
}
