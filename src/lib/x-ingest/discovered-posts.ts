import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCandidateRows, type XPostDiscovery } from "./candidate-rows";
import { upsertPosts } from "./repository";
import type { XMedia, XPost, XUser } from "./types";

export async function upsertDiscoveredPostsByAuthor({
  authors,
  posts,
  runId,
  supabase,
}: {
  authors: XUser[];
  posts: XPost[];
  runId: string;
  supabase: SupabaseClient;
}) {
  let written = 0;

  for (const [authorId, authorPosts] of groupPostsByAuthor(posts)) {
    const author = authors.find((item) => item.id === authorId);

    if (!author) {
      continue;
    }

    written += await upsertPosts(supabase, runId, author, authorPosts);
  }

  return written;
}

export function buildDiscoveredCandidateRows({
  authors,
  discoveryByPostId,
  mediaByKey,
  posts,
  reviewPastEventNotices,
}: {
  authors: XUser[];
  discoveryByPostId: Map<string, XPostDiscovery>;
  mediaByKey: Map<string, XMedia>;
  posts: XPost[];
  reviewPastEventNotices: boolean;
}) {
  return Array.from(groupPostsByAuthor(posts)).flatMap(
    ([authorId, authorPosts]) => {
      const author = authors.find((item) => item.id === authorId);

      if (!author) {
        return [];
      }

      return buildCandidateRows({
        account: author,
        discoveryByPostId,
        hydrateMode: "candidate_posts_only",
        mediaByKey,
        posts: authorPosts,
        reviewPastEventNotices,
      });
    },
  );
}

function groupPostsByAuthor(posts: XPost[]) {
  const groups = new Map<string, XPost[]>();

  for (const post of posts) {
    if (!post.author_id) {
      continue;
    }

    groups.set(post.author_id, [...(groups.get(post.author_id) ?? []), post]);
  }

  return groups;
}
