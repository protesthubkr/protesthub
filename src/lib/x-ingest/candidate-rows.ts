import { analyzePastEventNotice } from "@/lib/event-date-filter";
import {
  getCandidateReasons,
  getMediaForPost,
  getPostText,
  getPostUrl,
  shouldCreateCandidate,
  shouldReviewCandidate,
} from "./normalize";
import type { XMedia, XPost, XUser } from "./types";

export type XEventCandidateInsertRow = {
  x_post_id: string;
  status: "needs_review" | "ignored";
  source_account_name: string;
  source_post_url: string;
  text_snapshot: string;
  media_keys: string[];
  extraction_payload: Record<string, unknown>;
  candidate_reason: string[];
};

export function buildCandidateRows({
  account,
  mediaByKey,
  posts,
}: {
  account: XUser;
  mediaByKey: Map<string, XMedia>;
  posts: XPost[];
}) {
  return posts.flatMap((post): XEventCandidateInsertRow[] => {
    const media = getMediaForPost(post, mediaByKey);

    if (!shouldCreateCandidate(post, media)) {
      return [];
    }

    const postText = getPostText(post);
    const eventDateFilter = analyzePastEventNotice(postText);
    const candidateReasons = getCandidateReasons(post, media);
    const shouldReview = shouldReviewCandidate(post);
    const status =
      shouldReview && !eventDateFilter.ignoredAsPast
        ? "needs_review"
        : "ignored";

    return [
      {
        x_post_id: post.id,
        status,
        source_account_name: account.name,
        source_post_url: getPostUrl(account, post),
        text_snapshot: postText,
        media_keys: media.map((item) => item.media_key),
        extraction_payload: {
          source: "x_ingest_heuristic_v2",
          needs_ocr: media.length > 0,
          event_date_filter: eventDateFilter,
          quoted_post_ids:
            post.referenced_tweets
              ?.filter((reference) => reference.type === "quoted")
              .map((reference) => reference.id) ?? [],
          replied_to_post_ids:
            post.referenced_tweets
              ?.filter((reference) => reference.type === "replied_to")
              .map((reference) => reference.id) ?? [],
        },
        candidate_reason:
          eventDateFilter.ignoredAsPast || !shouldReview
            ? [
                ...candidateReasons,
                ...(eventDateFilter.ignoredAsPast ? ["past_event_date"] : []),
              ]
            : candidateReasons,
      },
    ];
  });
}
