export function formatCandidateReason(reason: string) {
  if (reason === "heuristic:v2") {
    return "후보 기준 v2";
  }

  if (reason.startsWith("review_keywords:")) {
    return `검수 키워드 ${reason.replace("review_keywords:", "")}`;
  }

  if (reason.startsWith("missing_review_keywords:")) {
    return "검수 키워드 부족";
  }

  if (reason.startsWith("keyword:")) {
    return `키워드 ${reason.replace("keyword:", "")}`;
  }

  if (reason.startsWith("strong_keyword:")) {
    return `강한 신호 ${reason.replace("strong_keyword:", "")}`;
  }

  if (reason.startsWith("weak_keyword:")) {
    return `보조 신호 ${reason.replace("weak_keyword:", "")}`;
  }

  if (reason.startsWith("weak_keyword_threshold:")) {
    return `보조 신호 기준 ${reason.replace("weak_keyword_threshold:", "")}`;
  }

  if (reason.startsWith("notice_hint:")) {
    return `공지성 신호 ${reason.replace("notice_hint:", "")}`;
  }

  if (reason.startsWith("ocr_keyword:")) {
    return `OCR 키워드 ${reason.replace("ocr_keyword:", "")}`;
  }

  if (reason.startsWith("manual_review_month_keyword:")) {
    return `수동 월 키워드 ${reason.replace("manual_review_month_keyword:", "")}`;
  }

  const exactLabels: Record<string, string> = {
    has_photo_media: "이미지 포함",
    has_date_hint: "날짜 신호",
    has_place_hint: "장소 신호",
    has_quote_post: "인용 포스트",
    low_confidence_image_only: "이미지 단독 확인",
    ocr_text_present: "OCR 텍스트 있음",
    ocr_text_empty: "OCR 텍스트 없음",
    ocr_has_date_hint: "OCR 날짜 신호",
    ocr_has_place_hint: "OCR 장소 신호",
    ocr_event_signal: "OCR 집회 신호",
    past_event_date: "오늘 이전 일정 제외",
    llm_structured_extracted: "구조화 추출됨",
    published_event: "공개 이벤트 저장",
    unpublished_event: "공개 이벤트 내림",
    manual_single_post: "수동 추가",
    manual_review_requested: "수동 검수 요청",
    "llm_input:post_text_only": "LLM 입력 본문만",
    "llm_input:post_text_and_ocr": "LLM 입력 본문+OCR",
    llm_event_candidate: "LLM 집회 후보",
    llm_not_event: "LLM 비대상",
    llm_has_date: "LLM 날짜 확인",
    llm_has_place: "LLM 장소 확인",
    x_detail_deferred: "X 상세 수집 전",
    x_detail_hydrated: "X 상세 수집 완료",
    has_unhydrated_media: "미수집 첨부 있음",
    has_unhydrated_quote: "미수집 인용 있음",
  };

  if (exactLabels[reason]) {
    return exactLabels[reason];
  }

  if (reason.startsWith("llm_status:")) {
    return `LLM 상태 ${reason.replace("llm_status:", "")}`;
  }

  if (reason.startsWith("llm_fallback_from:")) {
    return `LLM 재시도 원 모델 ${reason.replace("llm_fallback_from:", "")}`;
  }

  if (reason.startsWith("llm_fallback_to:")) {
    return `LLM 재시도 모델 ${reason.replace("llm_fallback_to:", "")}`;
  }

  if (reason.startsWith("llm_fallback_reason:")) {
    return `LLM 재시도 사유 ${reason.replace("llm_fallback_reason:", "")}`;
  }

  if (reason.startsWith("llm_issue:")) {
    return `LLM 의제 ${reason.replace("llm_issue:", "")}`;
  }

  return reason;
}
