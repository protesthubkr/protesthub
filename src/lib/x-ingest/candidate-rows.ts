import { analyzePastEventNotice } from "@/lib/event-date-filter";
import {
  getCandidateReasons,
  getMediaForPost,
  getPostText,
  getPostUrl,
  getReferencedPostIds,
  shouldCreateCandidate,
  shouldReviewCandidate,
} from "./normalize";
import {
  getCandidateDetailHydrationReasons,
  mergeCandidateMediaKeys,
} from "./hydration-state";
import type { XHydrateMode, XMedia, XPost, XUser } from "./types";

export type XEventCandidateInsertRow = {
  source_record_id: string;
  source_type: "x";
  status: "needs_review" | "ignored";
  source_name: string;
  source_url: string;
  text_snapshot: string;
  media_keys: string[];
  extraction_payload: Record<string, unknown>;
  review_reason: string[];
};

export type XPostDiscovery = {
  discoveredAt?: string;
  sourceAccountId: string;
  sourceAccountName: string;
  sourcePostId: string;
  sourcePostUrl: string;
  type: "retweet";
};

export function buildCandidateRows({
  account,
  discoveryByPostId,
  hydrateMode = "deferred",
  mediaByKey,
  posts,
  reviewPastEventNotices = false,
}: {
  account: XUser;
  discoveryByPostId?: Map<string, XPostDiscovery>;
  hydrateMode?: XHydrateMode;
  mediaByKey: Map<string, XMedia>;
  posts: XPost[];
  reviewPastEventNotices?: boolean;
}) {
  return posts.flatMap((post): XEventCandidateInsertRow[] => {
    const media = getMediaForPost(post, mediaByKey);
    const mediaKeys = mergeCandidateMediaKeys(
      media.map((item) => item.media_key),
      post.attachments?.media_keys,
    );
    const quotedPostIds = getReferencedPostIds(post, "quoted");
    const repliedToPostIds = getReferencedPostIds(post, "replied_to");
    const needsDetailHydration =
      hydrateMode === "deferred" &&
      (mediaKeys.length > 0 || quotedPostIds.length > 0);

    if (!shouldCreateCandidate(post, media) && mediaKeys.length === 0) {
      return [];
    }

    const postText = getPostText(post);
    const eventDateFilter = analyzePastEventNotice(postText);
    const candidateReasons = getCandidateReasons(post, media);
    const discovery = discoveryByPostId?.get(post.id);
    const shouldReview = shouldReviewCandidate(post, media);
    const shouldIgnoreAsPast =
      eventDateFilter.ignoredAsPast && !reviewPastEventNotices;
    const status =
      shouldReview && !shouldIgnoreAsPast ? "needs_review" : "ignored";

    return [
      {
        source_record_id: post.id,
        source_type: "x",
        status,
        source_name: account.name,
        source_url: getPostUrl(account, post),
        text_snapshot: postText,
        media_keys: mediaKeys,
        extraction_payload: {
          source: "x_ingest_heuristic_v2",
          source_type: "x",
          needs_ocr: media.length > 0,
          event_date_filter: eventDateFilter,
          ...(discovery ? { discovery } : {}),
          quoted_post_ids: quotedPostIds,
          replied_to_post_ids: repliedToPostIds,
          x_hydration: {
            status:
              hydrateMode === "deferred" ? "deferred" : "hydrated",
            needs_detail: needsDetailHydration,
            mode: hydrateMode,
            pending_media_keys:
              hydrateMode === "deferred" ? mediaKeys : [],
            pending_quoted_post_ids:
              hydrateMode === "deferred" ? quotedPostIds : [],
          },
        },
        review_reason:
          eventDateFilter.ignoredAsPast || !shouldReview
            ? [
                ...candidateReasons,
                ...getCandidateDetailHydrationReasons({
                  hydrateMode,
                  mediaKeys,
                  quotedPostIds,
                }),
                ...(discovery ? ["discovered_via_retweet"] : []),
                ...(eventDateFilter.ignoredAsPast ? ["past_event_date"] : []),
              ]
            : [
                ...candidateReasons,
                ...getCandidateDetailHydrationReasons({
                  hydrateMode,
                  mediaKeys,
                  quotedPostIds,
                }),
                ...(discovery ? ["discovered_via_retweet"] : []),
              ],
      },
    ];
  });
}
