export type StructuredEventExtractionInput = {
  sourceAccountName: string;
  sourcePostUrl: string;
  textSnapshot: string;
  ocrText: string;
  today: string;
};

export type StructuredEventDate = {
  date: string;
  start_time: string;
};

export type StructuredEventResult = {
  is_event: boolean;
  confidence: number;
  title: string;
  description: string;
  venue: string;
  address: string;
  region: string;
  organizers: string[];
  dates: StructuredEventDate[];
  issue_tags: string[];
  primary_issue: string;
  format: string;
  status_hint:
    | "publish_candidate"
    | "needs_review"
    | "ignore"
    | "canceled"
    | "duplicate_unknown";
  exclusion_reason: string;
  evidence: {
    title_source: string;
    date_source: string;
    place_source: string;
    issue_source: string;
  };
};

export type StructuredEventExtractionResult = {
  model: string;
  provider: "openai_responses";
  result: StructuredEventResult;
  fallback?: {
    fromModel: string;
    reasons: string[];
  };
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_EXTRACTION_MODEL = "gpt-5-nano";
const DEFAULT_EXTRACTION_FALLBACK_MODEL = "gpt-5-mini";
const MIN_CONFIDENCE_FOR_PRIMARY_MODEL = 70;

const ISSUE_TAGS = [
  "노동",
  "환경",
  "여성",
  "젠더",
  "장애",
  "주거",
  "평화",
  "정당",
];

const REGIONS = [
  "",
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

const STRUCTURED_EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_event",
    "confidence",
    "title",
    "description",
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
    description: { type: "string" },
    venue: { type: "string" },
    address: { type: "string" },
    region: { type: "string", enum: REGIONS },
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
      items: { type: "string", enum: ISSUE_TAGS },
    },
    primary_issue: { type: "string", enum: ["", ...ISSUE_TAGS] },
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

export class StructuredExtractionConfigError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured.") {
    super(message);
  }
}

export class StructuredExtractionRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`OpenAI structured extraction failed with status ${status}`);
  }
}

export async function extractStructuredEvent(
  input: StructuredEventExtractionInput,
): Promise<StructuredEventExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new StructuredExtractionConfigError();
  }

  const model = getExtractionModel();
  const primaryExtraction = await requestStructuredEvent(input, model, apiKey);
  const fallbackReasons = getFallbackReasons(input, primaryExtraction.result);
  const fallbackModel = getExtractionFallbackModel(model);

  if (!fallbackModel || fallbackReasons.length === 0) {
    return primaryExtraction;
  }

  return {
    ...(await requestStructuredEvent(input, fallbackModel, apiKey)),
    fallback: {
      fromModel: model,
      reasons: fallbackReasons,
    },
  };
}

async function requestStructuredEvent(
  input: StructuredEventExtractionInput,
  model: string,
  apiKey: string,
): Promise<StructuredEventExtractionResult> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildExtractionPrompt(input),
            },
          ],
        },
      ],
      max_output_tokens: 1800,
      text: {
        format: {
          type: "json_schema",
          name: "protest_event_extraction",
          strict: true,
          schema: STRUCTURED_EVENT_SCHEMA,
        },
      },
    }),
  });

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new StructuredExtractionRequestError(response.status, payload);
  }

  return {
    model,
    provider: "openai_responses",
    result: sanitizeStructuredEventResult(parseStructuredOutput(payload)),
  };
}

function buildExtractionPrompt(input: StructuredEventExtractionInput) {
  return [
    "You extract Korean protest/rally event information into strict JSON.",
    "Use only the provided source text and OCR text. Do not infer missing fields.",
    `Today is ${input.today} in Asia/Seoul. If all event dates are before today, set status_hint to ignore.`,
    "This service is for people who want to find upcoming protests/rallies to participate in.",
    "Treat public assemblies, demonstrations, marches, rallies, press conferences, sit-ins, vigils, picketing, memorial gatherings, and civic action days as events.",
    "Do not treat statements, press releases, election campaign canvassing, donation requests, seminars, webinars, lectures, private meetings, or retrospective reports as publishable events unless they clearly announce a public participation action.",
    "For dates without a year, use 2026.",
    "Return date as YYYY-MM-DD and start_time as HH:MM. Use an empty string when unknown.",
    "Place fields: venue is the broad public place shown as 장소. Include the region/city when present, e.g. '경남 창원시청 앞'.",
    "Place fields: address is the specific landmark or meeting point shown as 상세장소. Do not repeat venue text, e.g. source '장소: 경남 창원시청 앞 최윤덕 동상' -> venue '경남 창원시청 앞', address '최윤덕 동상'.",
    "Write description as a concise Korean public listing summary, not a raw post copy. Do not include URLs.",
    "Use only these issue tags: 노동, 환경, 여성, 젠더, 장애, 주거, 평화, 정당.",
    "If the source says canceled or postponed without a replacement date, set status_hint to canceled.",
    "",
    `Source account: ${input.sourceAccountName}`,
    `Source URL: ${input.sourcePostUrl}`,
    "",
    "[post text]",
    input.textSnapshot || "(empty)",
    "",
    "[OCR text]",
    input.ocrText || "(empty)",
  ].join("\n");
}

function getExtractionModel() {
  return process.env.OPENAI_EXTRACTION_MODEL?.trim() || DEFAULT_EXTRACTION_MODEL;
}

function getExtractionFallbackModel(primaryModel: string) {
  const rawValue = process.env.OPENAI_EXTRACTION_FALLBACK_MODEL;
  const fallbackModel =
    rawValue === undefined
      ? DEFAULT_EXTRACTION_FALLBACK_MODEL
      : rawValue.trim();

  if (!fallbackModel || fallbackModel === primaryModel) {
    return null;
  }

  return fallbackModel;
}

function getFallbackReasons(
  input: StructuredEventExtractionInput,
  result: StructuredEventResult,
) {
  const sourceText = `${input.textSnapshot}\n${input.ocrText}`;
  const hasDateKeyword = sourceText.includes("일시");
  const hasPlaceKeyword = sourceText.includes("장소");
  const reasons: string[] = [];

  if (result.confidence < MIN_CONFIDENCE_FOR_PRIMARY_MODEL) {
    reasons.push("low_confidence");
  }

  if (hasDateKeyword && result.dates.length === 0) {
    reasons.push("missing_date");
  }

  if (hasPlaceKeyword && !result.venue.trim()) {
    reasons.push("missing_venue");
  }

  if (hasDateKeyword && hasPlaceKeyword && !result.is_event) {
    reasons.push("source_has_date_place_but_not_event");
  }

  return reasons;
}

function sanitizeStructuredEventResult(
  result: StructuredEventResult,
): StructuredEventResult {
  const issueTags = result.issue_tags.filter((tag) => ISSUE_TAGS.includes(tag));
  const place = normalizePlaceFields({
    venue: result.venue.trim(),
    address: result.address.trim(),
  });

  return {
    ...result,
    confidence: Math.min(Math.max(Math.round(result.confidence), 0), 100),
    title: result.title.trim(),
    description: result.description.trim(),
    venue: place.venue,
    address: place.address,
    organizers: result.organizers.map((item) => item.trim()).filter(Boolean),
    dates: result.dates
      .map((date) => ({
        date: date.date.trim(),
        start_time: date.start_time.trim(),
      }))
      .filter((date) => date.date),
    issue_tags: issueTags,
    primary_issue: ISSUE_TAGS.includes(result.primary_issue)
      ? result.primary_issue
      : "",
  };
}

function normalizePlaceFields({
  venue,
  address,
}: {
  venue: string;
  address: string;
}) {
  const addressWithoutRegion = stripLeadingRegion(address);

  if (
    address &&
    addressWithoutRegion &&
    venue.startsWith(addressWithoutRegion) &&
    venue.length > addressWithoutRegion.length
  ) {
    return {
      venue: address,
      address: venue.slice(addressWithoutRegion.length).trim(),
    };
  }

  if (venue && !address) {
    const split = splitTrailingLandmark(venue);

    if (split) {
      return split;
    }
  }

  return { venue, address };
}

function stripLeadingRegion(value: string) {
  const region = REGIONS.filter(Boolean).find((item) =>
    value.startsWith(`${item} `),
  );

  return region ? value.slice(region.length).trim() : value;
}

function splitTrailingLandmark(value: string) {
  const frontPlaceMatch = value.match(/^(.+?\s앞)\s+(.+)$/);

  if (!frontPlaceMatch) {
    return null;
  }

  return {
    venue: frontPlaceMatch[1].trim(),
    address: frontPlaceMatch[2].trim(),
  };
}

function parseStructuredOutput(payload: unknown): StructuredEventResult {
  const text = readOutputText(payload);

  if (!text) {
    throw new Error("Structured extraction returned no output text.");
  }

  return JSON.parse(text) as StructuredEventResult;
}

function readOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return [];
      }

      const content = item.content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => {
        if (!part || typeof part !== "object") {
          return [];
        }

        if ("text" in part && typeof part.text === "string") {
          return [part.text];
        }

        return [];
      });
    })
    .join("")
    .trim();
}

async function readJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
