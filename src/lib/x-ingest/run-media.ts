import type { XMedia, XPost } from "./types";

export function createPostMap(posts: XPost[]) {
  return new Map(posts.map((post) => [post.id, post]));
}

export function createMediaMap(media: XMedia[]) {
  return new Map(media.map((item) => [item.media_key, item]));
}

export function dedupeMedia(media: XMedia[]) {
  return Array.from(createMediaMap(media).values());
}
