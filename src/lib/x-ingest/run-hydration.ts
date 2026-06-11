import { analyzePastEventNotice } from "@/lib/event-date-filter";
import { shouldReviewCandidate } from "./normalize-rules";
import { getPostText } from "./normalize-text";
import type { XPost } from "./types";
import { fetchPostsByIds } from "./x-api-tweets";

export function createEmptyHydratedTimeline() {
  return { data: [], includes: { media: [], tweets: [], users: [] } };
}

export async function hydrateCandidatePosts({
  bearerToken,
  posts,
  reviewPastEventNotices,
}: {
  bearerToken: string;
  posts: XPost[];
  reviewPastEventNotices: boolean;
}) {
  const postIds = posts
    .filter((post) =>
      shouldHydrateCandidatePost({ post, reviewPastEventNotices }),
    )
    .map((post) => post.id);

  if (postIds.length === 0) {
    return createEmptyHydratedTimeline();
  }

  return fetchPostsByIds({ bearerToken, postIds });
}

function shouldHydrateCandidatePost({
  post,
  reviewPastEventNotices,
}: {
  post: XPost;
  reviewPastEventNotices: boolean;
}) {
  if (!shouldReviewCandidate(post, [])) {
    return false;
  }

  if (reviewPastEventNotices) {
    return true;
  }

  return !analyzePastEventNotice(getPostText(post)).ignoredAsPast;
}
