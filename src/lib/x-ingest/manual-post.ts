import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getXIngestConfig, XIngestConfigError } from "./config";
import {
  createEmptyIngestCounters,
  createIngestRun,
  finishIngestRun,
  upsertAccounts,
  upsertMedia,
  upsertPostMedia,
  upsertPosts,
} from "./repository";
import type { XMedia, XPost, XUser } from "./types";
import { fetchPostById } from "./x-api";
import {
  getCandidateReasons,
  getMediaForPost,
  getPostText,
  getPostUrl,
} from "./normalize";

const MANUAL_SINGLE_POST_STRATEGY = "manual_single_post";
const MONTH_REVIEW_TOKENS = ["6월", "7월", "8월", "6.", "06.", "7.", "07."];

type ExistingCandidateRow = {
  id: string;
  candidate_reason: string[];
};

export type ManualXPostIngestResult = {
  candidateId: string;
  created: boolean;
  sourceAccountName: string;
  sourcePostUrl: string;
};

export async function ingestManualXPost(
  rawUrlOrId: string,
): Promise<ManualXPostIngestResult> {
  const postId = parseXPostId(rawUrlOrId);
  const config = getXIngestConfig();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new XIngestConfigError(getMissingSupabaseEnvKeys());
  }

  const runId = await createIngestRun(
    supabase,
    {
      collectionMode: MANUAL_SINGLE_POST_STRATEGY,
      source: rawUrlOrId,
      postId,
    },
    MANUAL_SINGLE_POST_STRATEGY,
  );
  const counters = createEmptyIngestCounters();

  try {
    const response = await fetchPostById({
      bearerToken: config.bearerToken,
      postId,
    });
    const post = response.data;

    if (!post) {
      throw new Error("X API returned no post data.");
    }

    const account = findAuthor(response.includes?.users ?? [], post);

    if (!account) {
      throw new Error("X API returned no author account.");
    }

    const media = dedupeMedia(response.includes?.media ?? []);
    const mediaByKey = createMediaMap(media);
    const postMedia = getMediaForPost(post, mediaByKey);
    const existingCandidate = await getExistingCandidate(supabase, post.id);

    counters.accountsSeen = 1;
    counters.postsSeen = 1;
    await upsertAccounts(supabase, [account]);
    await upsertMedia(supabase, media);
    counters.postsWritten = await upsertPosts(supabase, runId, account, [post]);
    await upsertPostMedia(supabase, [post]);

    const result = await upsertManualCandidate({
      account,
      existingCandidate,
      media: postMedia,
      post,
      responseErrors: response.errors ?? [],
      supabase,
    });

    counters.candidatesCreated = result.created ? 1 : 0;
    await finishIngestRun(supabase, runId, "succeeded", counters);

    return result;
  } catch (error) {
    await finishIngestRun(supabase, runId, "failed", counters, error);
    throw error;
  }
}

export function parseXPostId(rawUrlOrId: string) {
  const value = rawUrlOrId.trim();

  if (/^\d{5,}$/.test(value)) {
    return value;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("X 포스트 URL 또는 숫자 ID를 입력하세요.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const isXHost =
    hostname === "x.com" ||
    hostname === "twitter.com" ||
    hostname === "mobile.twitter.com";

  if (!isXHost) {
    throw new Error("x.com 또는 twitter.com 포스트 URL만 입력할 수 있습니다.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const statusIndex = segments.findIndex((segment) => segment === "status");
  const postId = statusIndex >= 0 ? segments[statusIndex + 1] : undefined;

  if (!postId || !/^\d{5,}$/.test(postId)) {
    throw new Error("URL에서 X 포스트 ID를 찾지 못했습니다.");
  }

  return postId;
}

async function upsertManualCandidate({
  account,
  existingCandidate,
  media,
  post,
  responseErrors,
  supabase,
}: {
  account: XUser;
  existingCandidate: ExistingCandidateRow | null;
  media: XMedia[];
  post: XPost;
  responseErrors: unknown[];
  supabase: SupabaseClient;
}) {
  const postText = getPostText(post);
  const sourcePostUrl = getPostUrl(account, post);
  const reasons = mergeReasons(existingCandidate?.candidate_reason ?? [], [
    ...getCandidateReasons(post, media),
    "manual_single_post",
    "manual_review_requested",
    ...getMonthTokenReasons(postText),
  ]);
  const payload = {
    source: MANUAL_SINGLE_POST_STRATEGY,
    raw_x_payload_includes_errors: responseErrors,
  };
  const values = {
    status: "needs_review",
    source_account_name: account.name,
    source_post_url: sourcePostUrl,
    text_snapshot: postText,
    media_keys: media.map((item) => item.media_key),
    extraction_payload: payload,
    candidate_reason: reasons,
    updated_at: new Date().toISOString(),
  };

  if (existingCandidate) {
    const { data, error } = await supabase
      .from("x_event_candidates")
      .update(values)
      .eq("id", existingCandidate.id)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update manual candidate.");
    }

    return {
      candidateId: data.id as string,
      created: false,
      sourceAccountName: account.name,
      sourcePostUrl,
    };
  }

  const { data, error } = await supabase
    .from("x_event_candidates")
    .insert({
      x_post_id: post.id,
      ...values,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create manual candidate.");
  }

  return {
    candidateId: data.id as string,
    created: true,
    sourceAccountName: account.name,
    sourcePostUrl,
  };
}

async function getExistingCandidate(
  supabase: SupabaseClient,
  postId: string,
) {
  const { data, error } = await supabase
    .from("x_event_candidates")
    .select("id,candidate_reason")
    .eq("x_post_id", postId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ExistingCandidateRow | null) ?? null;
}

function findAuthor(users: XUser[], post: XPost) {
  return users.find((user) => user.id === post.author_id) ?? users[0] ?? null;
}

function getMonthTokenReasons(text: string) {
  return MONTH_REVIEW_TOKENS.filter((token) => text.includes(token)).map(
    (token) => `manual_review_month_keyword:${token}`,
  );
}

function getMissingSupabaseEnvKeys() {
  const missingKeys: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missingKeys.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missingKeys.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missingKeys;
}

function createMediaMap(media: XMedia[]) {
  return new Map(media.map((item) => [item.media_key, item]));
}

function dedupeMedia(media: XMedia[]) {
  return Array.from(createMediaMap(media).values());
}

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}
