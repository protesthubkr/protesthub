import type { XPost } from "./types";

export function dedupePostsById(posts: XPost[]) {
  return Array.from(new Map(posts.map((post) => [post.id, post])).values());
}

export function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
