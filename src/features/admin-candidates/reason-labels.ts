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

  if (reason.startsWith("review_rule:")) {
    const ruleLabels: Record<string, string> = {
      strong_event_keyword: "검수 승격 강한 집회 신호",
      required_keyword_with_context: "검수 승격 일정 키워드+맥락",
      weak_keyword_threshold_with_context: "검수 승격 보조 신호+맥락",
      date_place_context: "검수 승격 날짜+장소",
      media_or_quote_with_date: "검수 승격 첨부/인용+날짜",
      date_backed_weak_signal: "검수 승격 날짜+보조 신호",
    };
    const rule = reason.replace("review_rule:", "");
    return ruleLabels[rule] ?? `검수 승격 규칙 ${rule}`;
  }

  if (reason.startsWith("review_suppressed:")) {
    const rule = reason.replace("review_suppressed:", "");
    return rule === "notice_only" ? "검수 억제 공지형" : `검수 억제 ${rule}`;
  }

  if (reason.startsWith("review_migration_version:")) {
    return `검수 승격 버전 ${reason.replace("review_migration_version:", "")}`;
  }

  if (reason.startsWith("review_migration_scope:")) {
    const scope = reason.replace("review_migration_scope:", "");
    return scope === "strict_auto_ignored"
      ? "검수 승격 범위 자동 ignored"
      : `검수 승격 범위 ${scope}`;
  }

  const exactLabels: Record<string, string> = {
    has_photo_media: "이미지 포함",
    has_media_attachment: "첨부 미디어 있음",
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
    admin_ignored: "관리자 무시",
    admin_duplicate: "관리자 중복",
    admin_canceled_candidate: "관리자 취소 후보",
    admin_reopened: "관리자 재검수",
    "review_migration:ignored_to_needs_review": "ignored에서 검수 대기로 승격",
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
