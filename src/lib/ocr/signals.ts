const OCR_EVENT_KEYWORDS = [
  "집회",
  "시위",
  "기자회견",
  "문화제",
  "추모문화제",
  "행진",
  "대행진",
  "농성",
  "촛불",
  "결의대회",
  "선언대회",
  "선전전",
  "피켓팅",
  "궐기",
  "추모제",
  "오체투지",
  "3보1배",
  "참가버스",
  "행동의 날",
];

const OCR_DATE_HINT_PATTERN =
  /(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}[./-]\d{1,2}|오늘|내일|모레|이번\s*(주|주말)|다음\s*(주|주말)|오전|오후|\d{1,2}\s*시|\d{1,2}:\d{2})/;

const OCR_PLACE_HINT_PATTERN =
  /(광장|역|출구|앞|시청|구청|군청|국회|대사관|영사관|법원|검찰청|경찰청|본관|거리|공원|집결|행진|로터리|사거리|분향소|센터|회관|빌딩|타워)/;

export function getOcrCandidateReasons(ocrText: string) {
  const text = ocrText.trim();

  if (!text || text === "OCR_TEXT_EMPTY") {
    return ["ocr_text_empty"];
  }

  const reasons = ["ocr_text_present"];
  const keywordReasons = OCR_EVENT_KEYWORDS.filter((keyword) =>
    text.includes(keyword),
  )
    .slice(0, 8)
    .map((keyword) => `ocr_keyword:${keyword}`);

  if (OCR_DATE_HINT_PATTERN.test(text)) {
    reasons.push("ocr_has_date_hint");
  }

  if (OCR_PLACE_HINT_PATTERN.test(text)) {
    reasons.push("ocr_has_place_hint");
  }

  if (keywordReasons.length > 0) {
    reasons.push("ocr_event_signal", ...keywordReasons);
  }

  return reasons;
}
