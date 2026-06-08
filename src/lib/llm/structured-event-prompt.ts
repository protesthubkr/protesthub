import type { StructuredEventExtractionInput } from "./structured-event";
import { STRUCTURED_EVENT_ISSUE_TAGS } from "./structured-event-options";

const POST_TEXT_CHAR_LIMIT = 3_500;
const OCR_TEXT_CHAR_LIMIT = 4_500;
const TRAILING_CONTEXT_CHARS = 700;

export function buildStructuredEventPrompt(
  input: StructuredEventExtractionInput,
) {
  return [
    "Extract Korean public protest/rally notice data as strict JSON.",
    "Use only the text below. Unknown fields must be empty string or empty array.",
    `Today: ${input.today} Asia/Seoul. Past-only event dates => status_hint ignore. Dates without year => 2026.`,
    "Event: public action such as 집회, 시위, 행진, 기자회견, 농성, 피켓팅, 추모제, 문화제, 시민행동.",
    "Ignore statements, reports, donations, lectures, meetings, campaign canvassing unless they announce public participation.",
    "Dates: YYYY-MM-DD. start_time: HH:MM or empty string.",
    "Place: venue=broad public place, address=specific meeting point/landmark only. Example '장소: 경남 창원시청 앞 최윤덕 동상' => venue '경남 창원시청 앞', address '최윤덕 동상'.",
    `Issue tags only: ${STRUCTURED_EVENT_ISSUE_TAGS.join(", ")}.`,
    "Canceled/postponed without replacement date => status_hint canceled.",
    "",
    `Source account: ${input.sourceAccountName}`,
    "",
    "[post text]",
    compactPromptText(input.textSnapshot, POST_TEXT_CHAR_LIMIT),
    "",
    "[OCR text]",
    compactPromptText(input.ocrText, OCR_TEXT_CHAR_LIMIT),
  ].join("\n");
}

function compactPromptText(text: string, maxChars: number) {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return "(empty)";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const omittedMarker = "\n[...omitted for token budget...]\n";
  const headLength = maxChars - TRAILING_CONTEXT_CHARS - omittedMarker.length;

  return [
    normalized.slice(0, Math.max(headLength, 0)).trimEnd(),
    omittedMarker.trim(),
    normalized.slice(-TRAILING_CONTEXT_CHARS).trimStart(),
  ].join("\n");
}
