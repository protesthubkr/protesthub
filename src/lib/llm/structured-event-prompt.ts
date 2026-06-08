import type { StructuredEventExtractionInput } from "./structured-event";
import { STRUCTURED_EVENT_ISSUE_TAGS } from "./structured-event-options";

export function buildStructuredEventPrompt(
  input: StructuredEventExtractionInput,
) {
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
    `Use only these issue tags: ${STRUCTURED_EVENT_ISSUE_TAGS.join(", ")}.`,
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
