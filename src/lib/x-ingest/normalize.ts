import type { XMedia, XPost, XUser } from "./types";

const EVENT_KEYWORDS = [
  "집회",
  "시위",
  "기자회견",
  "문화제",
  "행진",
  "농성",
  "촛불",
  "행동",
  "궐기",
  "대회",
  "연대",
  "추모",
  "참가",
  "모입니다",
  "함께해",
  "함께 해",
];

export function getPostUrl(account: XUser, post: XPost) {
  return `https://x.com/${account.username}/status/${post.id}`;
}

export function getMediaForPost(post: XPost, mediaByKey: Map<string, XMedia>) {
  return (post.attachments?.media_keys ?? [])
    .map((mediaKey) => mediaByKey.get(mediaKey))
    .filter((media): media is XMedia => Boolean(media));
}

export function getCandidateReasons(post: XPost, media: XMedia[]) {
  const reasons: string[] = [];
  const text = post.text ?? "";
  const hasImage = media.some((item) => item.type === "photo");
  const matchedKeywords = EVENT_KEYWORDS.filter((keyword) =>
    text.includes(keyword),
  );

  if (hasImage) {
    reasons.push("has_photo_media");
  }

  if (matchedKeywords.length > 0) {
    reasons.push(...matchedKeywords.map((keyword) => `keyword:${keyword}`));
  }

  if (post.referenced_tweets?.some((reference) => reference.type === "quoted")) {
    reasons.push("has_quote_post");
  }

  return reasons;
}

export function shouldCreateCandidate(post: XPost, media: XMedia[]) {
  return getCandidateReasons(post, media).length > 0;
}
