import type { IssueKey } from "./types";

export type IssueOption = {
  key: IssueKey;
  label: string;
  primary: string;
  bg: string;
  text: string;
};

export const ISSUE_OPTIONS: IssueOption[] = [
  {
    key: "labor",
    label: "노동",
    primary: "#D92D20",
    bg: "#FFF1F0",
    text: "#B42318",
  },
  {
    key: "environment",
    label: "환경",
    primary: "#178C4B",
    bg: "#EAF8EF",
    text: "#166534",
  },
  {
    key: "women",
    label: "여성",
    primary: "#C02674",
    bg: "#FDF2F8",
    text: "#9D174D",
  },
  {
    key: "gender",
    label: "성소수자",
    primary: "#6D5BD0",
    bg: "#F3F0FF",
    text: "#5B21B6",
  },
  {
    key: "disability",
    label: "장애",
    primary: "#2563EB",
    bg: "#EFF6FF",
    text: "#1D4ED8",
  },
  {
    key: "housing",
    label: "주거",
    primary: "#B7791F",
    bg: "#FFF7E6",
    text: "#92400E",
  },
  {
    key: "peace",
    label: "평화",
    primary: "#0891B2",
    bg: "#ECFEFF",
    text: "#0E7490",
  },
  {
    key: "party",
    label: "정당",
    primary: "#475569",
    bg: "#F1F5F9",
    text: "#334155",
  },
];

export const ISSUE_BY_KEY = ISSUE_OPTIONS.reduce(
  (acc, issue) => {
    acc[issue.key] = issue;
    return acc;
  },
  {} as Record<IssueKey, IssueOption>,
);

const ISSUE_KEY_ALIASES: Record<string, IssueKey> = {
  젠더: "gender",
};

export function getIssueLabel(key: IssueKey) {
  return ISSUE_BY_KEY[key]?.label ?? key;
}

export function getIssueKeyFromValue(value: string | null | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return (
    ISSUE_OPTIONS.find(
      (issue) =>
        issue.key === normalizedValue || issue.label === normalizedValue,
    )?.key ??
    ISSUE_KEY_ALIASES[normalizedValue] ??
    null
  );
}

export function getIssueLabelFromValue(value: string) {
  const issueKey = getIssueKeyFromValue(value);

  return issueKey ? getIssueLabel(issueKey) : value;
}
