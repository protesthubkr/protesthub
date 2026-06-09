import {
  DATE_HINT_PATTERN,
  NOTICE_ONLY_KEYWORDS,
  ONE_TIME_DONATION_PATTERN,
  PLACE_HINT_PATTERN,
  REVIEW_KEYWORDS,
  STRONG_EVENT_KEYWORDS,
  WEAK_EVENT_KEYWORDS,
} from "./normalize-keywords";
import {
  getMeaningfulPostText,
  getMediaKeysForPostAndReferences,
  getPostText,
  getSearchableText,
} from "./normalize-text";
import type { XMedia, XPost } from "./types";

export type CandidateSignals = {
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

export function getCandidateSignals(
  post: XPost,
  media: XMedia[],
): CandidateSignals {
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

export function findReviewKeywords(text: string) {
  return findMatches(getReviewKeywordSearchText(text), REVIEW_KEYWORDS);
}

export function findMatches(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword));
}

function hasReviewKeyword(text: string) {
  return findReviewKeywords(text).length > 0;
}

function getReviewKeywordSearchText(text: string) {
  return text.replace(ONE_TIME_DONATION_PATTERN, "");
}
