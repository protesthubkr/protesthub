import type { CandidateHydrationRow } from "./candidate-detail-types";
import type { XPost, XUser } from "./types";

export function findAuthor(users: XUser[], post: XPost) {
  return users.find((user) => user.id === post.author_id) ?? users[0];
}

export function dedupeCandidates(rows: CandidateHydrationRow[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}
