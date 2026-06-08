import {
  STRUCTURED_EVENT_ISSUE_TAGS,
  STRUCTURED_EVENT_REGIONS,
} from "./structured-event-options";

export const STRUCTURED_EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_event",
    "confidence",
    "title",
    "venue",
    "address",
    "region",
    "organizers",
    "dates",
    "issue_tags",
    "primary_issue",
    "format",
    "status_hint",
    "exclusion_reason",
    "evidence",
  ],
  properties: {
    is_event: { type: "boolean" },
    confidence: { type: "integer" },
    title: { type: "string" },
    venue: { type: "string" },
    address: { type: "string" },
    region: { type: "string", enum: STRUCTURED_EVENT_REGIONS },
    organizers: { type: "array", items: { type: "string" } },
    dates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "start_time"],
        properties: {
          date: { type: "string" },
          start_time: { type: "string" },
        },
      },
    },
    issue_tags: {
      type: "array",
      items: { type: "string", enum: STRUCTURED_EVENT_ISSUE_TAGS },
    },
    primary_issue: {
      type: "string",
      enum: ["", ...STRUCTURED_EVENT_ISSUE_TAGS],
    },
    format: {
      type: "string",
      enum: [
        "집회",
        "시위",
        "기자회견",
        "문화제",
        "행진",
        "농성",
        "피켓팅",
        "추모제",
        "기타",
        "해당 없음",
      ],
    },
    status_hint: {
      type: "string",
      enum: [
        "publish_candidate",
        "needs_review",
        "ignore",
        "canceled",
        "duplicate_unknown",
      ],
    },
    exclusion_reason: { type: "string" },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: [
        "title_source",
        "date_source",
        "place_source",
        "issue_source",
      ],
      properties: {
        title_source: { type: "string" },
        date_source: { type: "string" },
        place_source: { type: "string" },
        issue_source: { type: "string" },
      },
    },
  },
};
