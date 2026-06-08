import type { XMedia, XPost, XUser } from "./types";

const STRONG_EVENT_KEYWORDS = [
  "집회",
  "시위",
  "1인시위",
  "기자회견",
  "문화제",
  "추모문화제",
  "행진",
  "농성",
  "촛불",
  "퍼레이드",
  "결의대회",
  "선전전",
  "피켓팅",
  "피켓 시위",
  "궐기",
  "추모제",
  "오체투지",
  "행동의 날",
];

const WEAK_EVENT_KEYWORDS = [
  "모입니다",
  "모여",
  "참여",
  "참가",
  "함께",
  "연대",
  "행동",
  "대회",
  "집결",
];

const NOTICE_ONLY_KEYWORDS = [
  "성명",
  "논평",
  "보도자료",
  "입장문",
  "카드뉴스",
  "토론회",
  "강연",
  "교육",
  "세미나",
  "웨비나",
  "간담회",
  "후원",
  "채용",
  "모집",
  "공모",
  "축하",
];

const DATE_HINT_PATTERN =
  /(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}[./-]\d{1,2}|오늘|내일|모레|이번\s*(주|주말)|다음\s*(주|주말)|오전|오후|\d{1,2}\s*시|\d{1,2}:\d{2})/;

const PLACE_HINT_PATTERN =
  /(광장|역|출구|앞|시청|구청|군청|국회|대사관|영사관|법원|검찰청|경찰청|본관|거리|공원|집결|행진|로터리|사거리|분향소|센터|회관|빌딩|타워)/;

const REVIEW_KEYWORDS = ["일시", "날짜", "일정"];
const MIN_WEAK_EVENT_KEYWORDS_FOR_REVIEW = 3;
const ONE_TIME_DONATION_PATTERN = /일시\s*후원(?:하기)?/g;
const NON_EVENT_SUPPRESSION_KEYWORDS = [
  "성명",
  "논평",
  "보도자료",
  "입장문",
  "카드뉴스",
  "토론회",
  "강연",
  "교육",
  "세미나",
  "웨비나",
  "간담회",
  "채용",
  "모집",
  "공모",
  "축하",
];

type CandidateSignals = {
  hasPhoto: boolean;
  hasMediaAttachment: boolean;
  hasQuotedPost: boolean;
  hasDateHint: boolean;
  hasPlaceHint: boolean;
  isImageOnlyPost: boolean;
  hasRequiredReviewKeywords: boolean;
  strongKeywords: string[];
  weakKeywords: string[];
  noticeOnlyKeywords: string[];
};

export function getPostUrl(account: XUser, post: XPost) {
  return `https://x.com/${account.username}/status/${post.id}`;
}

export function getMediaForPost(post: XPost, mediaByKey: Map<string, XMedia>) {
  return getMediaKeysForPostAndReferences(post)
    .map((mediaKey) => mediaByKey.get(mediaKey))
    .filter((media): media is XMedia => Boolean(media));
}

export function getPostText(post: XPost) {
  return post.note_tweet?.text ?? post.text ?? "";
}

export function getReferencedPostIds(
  post: XPost,
  type: NonNullable<XPost["referenced_tweets"]>[number]["type"],
) {
  return (
    post.referenced_tweets
      ?.filter((reference) => reference.type === type)
      .map((reference) => reference.id) ?? []
  );
}

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

function getCandidateSignals(post: XPost, media: XMedia[]): CandidateSignals {
  const text = getSearchableText(post, media);
  const postText = getPostText(post);
  const meaningfulPostText = getMeaningfulPostText(postText);
  const hasPhoto = media.some((item) => item.type === "photo");
  const hasMediaAttachment =
    hasPhoto || getMediaKeysForPostAndReferences(post).length > 0;

  return {
    hasPhoto,
    hasMediaAttachment,
    hasQuotedPost:
      post.referenced_tweets?.some((reference) => reference.type === "quoted") ??
      false,
    hasDateHint: DATE_HINT_PATTERN.test(text),
    hasPlaceHint: PLACE_HINT_PATTERN.test(text),
    isImageOnlyPost: hasMediaAttachment && meaningfulPostText.length <= 12,
    hasRequiredReviewKeywords: hasReviewKeyword(postText),
    strongKeywords: findMatches(text, STRONG_EVENT_KEYWORDS),
    weakKeywords: findMatches(text, WEAK_EVENT_KEYWORDS),
    noticeOnlyKeywords: findMatches(text, NOTICE_ONLY_KEYWORDS),
  };
}

function getSearchableText(post: XPost, media: XMedia[]) {
  return [getPostText(post), ...media.map((item) => item.alt_text)]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function getMediaKeysForPostAndReferences(post: XPost) {
  const mediaKeys = [...(post.attachments?.media_keys ?? [])];
  const referencedPostIds = new Set(
    post.referenced_tweets?.map((reference) => reference.id) ?? [],
  );

  for (const referencedPost of post.hydration_includes?.tweets ?? []) {
    if (referencedPostIds.has(referencedPost.id)) {
      mediaKeys.push(...(referencedPost.attachments?.media_keys ?? []));
    }
  }

  return Array.from(new Set(mediaKeys));
}

function hasReviewKeyword(text: string) {
  return findReviewKeywords(text).length > 0;
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

function findReviewKeywords(text: string) {
  return findMatches(getReviewKeywordSearchText(text), REVIEW_KEYWORDS);
}

function findMatches(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword));
}

function getReviewKeywordSearchText(text: string) {
  return text.replace(ONE_TIME_DONATION_PATTERN, "");
}

function getMeaningfulPostText(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/&lt;|&gt;|&amp;/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}
