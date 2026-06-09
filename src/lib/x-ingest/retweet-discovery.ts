import { getPostUrl, getReferencedPostIds } from "./normalize";
import { dedupeMedia } from "./run-media";
import type { XMedia, XPost, XUser } from "./types";
import { fetchPostsByIds } from "./x-api";
import type { XPostDiscovery } from "./candidate-rows";

export type RetweetedOriginals = {
  authors: XUser[];
  discoveryByPostId: Map<string, XPostDiscovery>;
  media: XMedia[];
  posts: XPost[];
};

export async function fetchRetweetedOriginalPosts({
  bearerToken,
  ignoredAuthorIds,
  posts,
  retweetedByAccount,
}: {
  bearerToken: string;
  ignoredAuthorIds?: Set<string>;
  posts: XPost[];
  retweetedByAccount: XUser;
}): Promise<RetweetedOriginals> {
  const retweets = posts.flatMap((post) =>
    getReferencedPostIds(post, "retweeted").map((originalPostId) => ({
      originalPostId,
      wrapperPost: post,
    })),
  );
  const originalPostIds = Array.from(
    new Set(retweets.map((retweet) => retweet.originalPostId)),
  );

  if (originalPostIds.length === 0) {
    return {
      authors: [],
      discoveryByPostId: new Map<string, XPostDiscovery>(),
      media: [],
      posts: [],
    };
  }

  const response = await fetchPostsByIds({
    bearerToken,
    postIds: originalPostIds,
  });
  const retweetByOriginalPostId = new Map(
    retweets.map((retweet) => [retweet.originalPostId, retweet.wrapperPost]),
  );
  const discoveryByPostId = new Map<string, XPostDiscovery>();
  const discoveredPosts = (response.data ?? []).filter(
    (post) => post.author_id && !ignoredAuthorIds?.has(post.author_id),
  );
  const discoveredAuthorIds = new Set(
    discoveredPosts
      .map((post) => post.author_id)
      .filter((authorId): authorId is string => Boolean(authorId)),
  );
  const discoveredMediaKeys = new Set(
    discoveredPosts.flatMap((post) => post.attachments?.media_keys ?? []),
  );

  for (const post of discoveredPosts) {
    const wrapperPost = retweetByOriginalPostId.get(post.id);

    if (!wrapperPost) {
      continue;
    }

    discoveryByPostId.set(post.id, {
      discoveredAt: wrapperPost.created_at,
      sourceAccountId: retweetedByAccount.id,
      sourceAccountName: retweetedByAccount.name,
      sourcePostId: wrapperPost.id,
      sourcePostUrl: getPostUrl(retweetedByAccount, wrapperPost),
      type: "retweet",
    });
  }

  return {
    authors:
      response.includes?.users?.filter((author) =>
        discoveredAuthorIds.has(author.id),
      ) ?? [],
    discoveryByPostId,
    media: dedupeMedia(
      response.includes?.media?.filter((item) =>
        discoveredMediaKeys.has(item.media_key),
      ) ?? [],
    ),
    posts: discoveredPosts,
  };
}

export function isRetweetWrapper(post: XPost) {
  return getReferencedPostIds(post, "retweeted").length > 0;
}
