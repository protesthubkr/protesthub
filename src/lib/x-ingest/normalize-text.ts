import type { XMedia, XPost, XUser } from "./types";

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

export function getSearchableText(post: XPost, media: XMedia[]) {
  return [getPostText(post), ...media.map((item) => item.alt_text)]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function getMediaKeysForPostAndReferences(post: XPost) {
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

export function getMeaningfulPostText(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/&lt;|&gt;|&amp;/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}
