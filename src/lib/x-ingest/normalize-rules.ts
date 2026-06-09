import {
  MIN_WEAK_EVENT_KEYWORDS_FOR_REVIEW,
  NON_EVENT_SUPPRESSION_KEYWORDS,
} from "./normalize-keywords";
import {
  findReviewKeywords,
  getCandidateSignals,
  type CandidateSignals,
} from "./normalize-signals";
import { getPostText } from "./normalize-text";
import type { XMedia, XPost } from "./types";

export function getCandidateReasons(post: XPost, media: XMedia[]) {
  const signals = getCandidateSignals(post, media);
  const reasons: string[] = ["heuristic:v2"];

  if (signals.hasRequiredReviewKeywords) {
    reasons.push(
      `review_keywords:${findReviewKeywords(getPostText(post)).join("+")}`,
    );
  } else {
    reasons.push("missing_review_keywords:일시|날짜|일정");
  }

  if (signals.hasPhoto) {
    reasons.push("has_photo_media");
  } else if (signals.hasMediaAttachment) {
    reasons.push("has_media_attachment");
  }

  if (signals.hasDateHint) {
    reasons.push("has_date_hint");
  }

  if (signals.hasPlaceHint) {
    reasons.push("has_place_hint");
  }

  if (signals.hasQuotedPost) {
    reasons.push("has_quote_post");
  }

  if (signals.isImageOnlyPost) {
    reasons.push("low_confidence_image_only");
  }

  if (hasEnoughWeakEventKeywords(signals)) {
    reasons.push(
      `weak_keyword_threshold:${signals.weakKeywords.length}/${MIN_WEAK_EVENT_KEYWORDS_FOR_REVIEW}`,
    );
  }

  reasons.push(...getReviewPromotionReasons(signals));

  if (isNoticeSuppressedWithoutEventAnchor(signals)) {
    reasons.push("review_suppressed:notice_only");
  }

  reasons.push(
    ...signals.strongKeywords.map((keyword) => `strong_keyword:${keyword}`),
    ...signals.weakKeywords.map((keyword) => `weak_keyword:${keyword}`),
    ...signals.noticeOnlyKeywords.map((keyword) => `notice_hint:${keyword}`),
  );

  return reasons;
}

export function shouldCreateCandidate(post: XPost, media: XMedia[]) {
  return Boolean(getPostText(post).trim() || media.length > 0);
}

export function shouldReviewCandidate(post: XPost, media: XMedia[]) {
  const signals = getCandidateSignals(post, media);

  return getReviewPromotionReasons(signals).length > 0;
}

function hasEnoughWeakEventKeywords(signals: CandidateSignals) {
  return signals.weakKeywords.length >= MIN_WEAK_EVENT_KEYWORDS_FOR_REVIEW;
}

function hasStrongEventKeyword(signals: CandidateSignals) {
  return signals.strongKeywords.length > 0;
}

function getReviewPromotionReasons(signals: CandidateSignals) {
  if (isNoticeSuppressedWithoutEventAnchor(signals)) {
    return [];
  }

  const reasons: string[] = [];

  if (
    hasStrongEventKeyword(signals) &&
    hasEventScheduleSignal(signals) &&
    hasEventContextSignal(signals)
  ) {
    reasons.push("review_rule:strong_event_keyword");
  }

  if (
    hasStrongEventKeyword(signals) &&
    (signals.hasMediaAttachment || signals.hasQuotedPost) &&
    (signals.hasDateHint ||
      signals.hasPlaceHint ||
      signals.hasQuotedPost ||
      signals.weakKeywords.length > 0)
  ) {
    reasons.push("review_rule:strong_event_with_media_context");
  }

  if (
    signals.hasRequiredReviewKeywords &&
    (hasStrongEventKeyword(signals) ||
      signals.hasPlaceHint ||
      signals.hasMediaAttachment ||
      signals.hasQuotedPost)
  ) {
    reasons.push("review_rule:required_keyword_with_context");
  }

  if (
    hasEnoughWeakEventKeywords(signals) &&
    (signals.hasDateHint ||
      signals.hasPlaceHint ||
      signals.hasQuotedPost)
  ) {
    reasons.push("review_rule:weak_keyword_threshold_with_context");
  }

  if (
    signals.hasDateHint &&
    signals.hasPlaceHint &&
    (hasStrongEventKeyword(signals) ||
      signals.hasRequiredReviewKeywords ||
      signals.hasQuotedPost ||
      signals.weakKeywords.length >= 2)
  ) {
    reasons.push("review_rule:date_place_context");
  }

  if (
    (signals.hasMediaAttachment || signals.hasQuotedPost) &&
    signals.hasDateHint &&
    (hasStrongEventKeyword(signals) ||
      signals.hasRequiredReviewKeywords ||
      (signals.hasPlaceHint && signals.weakKeywords.length > 0) ||
      signals.weakKeywords.length >= 2)
  ) {
    reasons.push("review_rule:media_or_quote_with_date");
  }

  if (
    signals.hasDateHint &&
    (signals.hasMediaAttachment || signals.hasQuotedPost)
  ) {
    reasons.push("review_rule:date_with_media_or_quote");
  }

  if (
    signals.hasDateHint &&
    signals.weakKeywords.length > 0 &&
    (hasStrongEventKeyword(signals) ||
      signals.hasPlaceHint ||
      signals.hasQuotedPost ||
      signals.weakKeywords.length >= 2)
  ) {
    reasons.push("review_rule:date_backed_weak_signal");
  }

  return reasons;
}

function hasEventScheduleSignal(signals: CandidateSignals) {
  return signals.hasDateHint || signals.hasRequiredReviewKeywords;
}

function hasEventContextSignal(signals: CandidateSignals) {
  return (
    signals.hasPlaceHint ||
    signals.hasMediaAttachment ||
    signals.hasQuotedPost ||
    signals.weakKeywords.length > 0
  );
}

function isNoticeSuppressedWithoutEventAnchor(signals: CandidateSignals) {
  return (
    !hasStrongEventKeyword(signals) &&
    signals.noticeOnlyKeywords.some((keyword) =>
      NON_EVENT_SUPPRESSION_KEYWORDS.includes(keyword),
    )
  );
}
