import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePastEventNotice } from "@/lib/event-date-filter";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getCandidateReasons,
  shouldCreateCandidate,
  shouldReviewCandidate,
} from "@/lib/x-ingest/normalize";
import type { XMedia, XPost } from "@/lib/x-ingest/types";
import {
  fetchTelegramHtml,
  getMetaContent,
  normalizeText,
  stripHtml,
} from "./html";
import { extractTelegramMessageImageUrls } from "./message-images";

const TELEGRAM_CHANNEL_SCAN_SOURCE = "telegram_channel_subscription_scan";
const NEW_CHANNEL_LOOKBACK_DAYS = 60;
const DEFAULT_MAX_PAGES_PER_CHANNEL = 60;

export type TelegramChannelSubscriptionStatus = "active" | "paused";

export type TelegramChannelSubscription = {
  id: string;
  channelTitle: string;
  channelUsername: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastCheckedMessageAt: string | null;
  lastCheckedMessageId: number | null;
  lastScanError: string | null;
  lastScanFinishedAt: string | null;
  lastScanStartedAt: string | null;
  sourceUrl: string;
  status: TelegramChannelSubscriptionStatus;
  updatedAt: string;
};

export type TelegramChannelScanResult = {
  candidatesCreated: number;
  channelsScanned: number;
  ignoredCreated: number;
  messagesSeen: number;
  needsReviewCreated: number;
};

type TelegramSubscriptionRow = {
  id: string;
  channel_title: string | null;
  channel_username: string;
  created_at: string;
  last_checked_at: string | null;
  last_checked_message_at: string | null;
  last_checked_message_id: number | null;
  last_scan_error: string | null;
  last_scan_finished_at: string | null;
  last_scan_started_at: string | null;
  source_url: string;
  status: TelegramChannelSubscriptionStatus;
  updated_at: string;
};

type TelegramChannelMessage = {
  createdAt: string | null;
  imageUrls: string[];
  messageId: number;
  rawHtml: string;
  sourceUrl: string;
  text: string;
};

type TelegramChannelPage = {
  beforeMessageId: number | null;
  channelTitle: string;
  messages: TelegramChannelMessage[];
};

type TelegramCandidateEvaluation = {
  eventDateFilter: ReturnType<typeof analyzePastEventNotice>;
  media: XMedia[];
  reviewReason: string[];
  shouldCreate: boolean;
  status: "needs_review" | "ignored";
};

export async function getTelegramChannelSubscriptions() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return [] satisfies TelegramChannelSubscription[];
  }

  const { data, error } = await supabase
    .from("telegram_channel_subscriptions")
    .select(
      [
        "id",
        "channel_username",
        "channel_title",
        "source_url",
        "status",
        "last_checked_at",
        "last_checked_message_id",
        "last_checked_message_at",
        "last_scan_started_at",
        "last_scan_finished_at",
        "last_scan_error",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .order("status", { ascending: true })
    .order("channel_username", { ascending: true });

  if (error) {
    if (isMissingTelegramSubscriptionTableError(error)) {
      return [] satisfies TelegramChannelSubscription[];
    }

    throw new Error(error.message);
  }

  return ((data as unknown as TelegramSubscriptionRow[] | null) ?? []).map(
    mapSubscriptionRow,
  );
}

export async function addTelegramChannelSubscription(rawInput: string) {
  const channelUsername = normalizeTelegramChannelInput(rawInput);
  const supabase = getRequiredSupabaseAdminClient();
  const sourceUrl = createTelegramChannelSourceUrl(channelUsername);
  const page = await fetchTelegramChannelPage(channelUsername);
  const channelTitle = page.channelTitle || `@${channelUsername}`;

  const { data, error } = await supabase
    .from("telegram_channel_subscriptions")
    .upsert(
      {
        channel_title: channelTitle,
        channel_username: channelUsername,
        last_scan_error: null,
        source_url: sourceUrl,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_username" },
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "텔레그램 채널 구독을 저장하지 못했습니다.");
  }

  return {
    channelTitle,
    channelUsername,
    subscriptionId: data.id as string,
  };
}

export async function updateTelegramChannelSubscriptionStatus({
  id,
  status,
}: {
  id: string;
  status: TelegramChannelSubscriptionStatus;
}) {
  const supabase = getRequiredSupabaseAdminClient();
  const { error } = await supabase
    .from("telegram_channel_subscriptions")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteTelegramChannelSubscription(id: string) {
  const supabase = getRequiredSupabaseAdminClient();
  const { error } = await supabase
    .from("telegram_channel_subscriptions")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function scanTelegramChannelSubscriptions({
  subscriptionId,
}: {
  subscriptionId?: string;
} = {}): Promise<TelegramChannelScanResult> {
  const supabase = getRequiredSupabaseAdminClient();
  const subscriptions = await getScannableSubscriptions(supabase, subscriptionId);
  const result: TelegramChannelScanResult = {
    candidatesCreated: 0,
    channelsScanned: 0,
    ignoredCreated: 0,
    messagesSeen: 0,
    needsReviewCreated: 0,
  };

  for (const subscription of subscriptions) {
    result.channelsScanned += 1;
    const channelStartedAt = new Date().toISOString();

    await markSubscriptionScanStarted(supabase, subscription.id, channelStartedAt);

    try {
      const scan = await scanSingleChannelSubscription(supabase, subscription);
      result.candidatesCreated += scan.candidatesCreated;
      result.ignoredCreated += scan.ignoredCreated;
      result.messagesSeen += scan.messagesSeen;
      result.needsReviewCreated += scan.needsReviewCreated;
    } catch (error) {
      await markSubscriptionScanFailed(supabase, subscription.id, error);
      throw error;
    }
  }

  return result;
}

export function normalizeTelegramChannelInput(rawInput: string) {
  const value = rawInput.trim().replace(/^@/, "");

  if (!value) {
    throw new Error("텔레그램 채널명 또는 공개 채널 링크를 입력하세요.");
  }

  let channel = value;

  if (/^https?:\/\//i.test(value)) {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new Error("텔레그램 공개 채널 링크 형식을 확인하세요.");
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname !== "t.me" && hostname !== "telegram.me") {
      throw new Error("t.me 또는 telegram.me 공개 채널 링크만 입력할 수 있습니다.");
    }

    const segments = url.pathname.split("/").filter(Boolean);
    channel = segments[0] === "s" ? segments[1] ?? "" : segments[0] ?? "";

    if (!channel || channel === "c" || channel.startsWith("+")) {
      throw new Error("비공개 채널 링크는 구독 수집에 사용할 수 없습니다.");
    }
  }

  const normalized = channel.replace(/^@/, "").toLowerCase();

  if (!/^[a-z0-9_]{4,64}$/.test(normalized)) {
    throw new Error("텔레그램 공개 채널 username을 확인하세요.");
  }

  return normalized;
}

function getRequiredSupabaseAdminClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase admin client is not configured.");
  }

  return supabase;
}

async function getScannableSubscriptions(
  supabase: SupabaseClient,
  subscriptionId?: string,
) {
  let query = supabase
    .from("telegram_channel_subscriptions")
    .select(
      [
        "id",
        "channel_username",
        "channel_title",
        "source_url",
        "status",
        "last_checked_at",
        "last_checked_message_id",
        "last_checked_message_at",
        "last_scan_started_at",
        "last_scan_finished_at",
        "last_scan_error",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("status", "active")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .order("channel_username", { ascending: true });

  if (subscriptionId) {
    query = query.eq("id", subscriptionId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data as unknown as TelegramSubscriptionRow[] | null) ?? []).map(
    mapSubscriptionRow,
  );
}

async function scanSingleChannelSubscription(
  supabase: SupabaseClient,
  subscription: TelegramChannelSubscription,
) {
  const scanStartedAt = new Date().toISOString();
  const cutoff = getSubscriptionCutoff(subscription, scanStartedAt);
  const maxPages = getMaxPagesPerChannel();
  let beforeMessageId: number | null = null;
  let candidatesCreated = 0;
  let ignoredCreated = 0;
  let messagesSeen = 0;
  let needsReviewCreated = 0;
  let newestMessage = getCursorMessage(subscription);
  let latestChannelTitle = subscription.channelTitle;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await fetchTelegramChannelPage(
      subscription.channelUsername,
      beforeMessageId,
    );

    if (page.channelTitle) {
      latestChannelTitle = page.channelTitle;
    }

    if (page.messages.length === 0) {
      break;
    }

    const eligibleMessages = page.messages.filter((message) =>
      shouldCollectMessage(message, subscription, cutoff),
    );
    messagesSeen += eligibleMessages.length;
    const upsertResult = await upsertTelegramChannelCandidates({
      channelTitle: latestChannelTitle,
      messages: eligibleMessages,
      subscription,
      supabase,
    });
    candidatesCreated += upsertResult.candidatesCreated;
    ignoredCreated += upsertResult.ignoredCreated;
    needsReviewCreated += upsertResult.needsReviewCreated;
    newestMessage = pickNewerMessage(newestMessage, getNewestMessage(page.messages));

    if (shouldStopScanningPage(page, subscription, cutoff)) {
      break;
    }

    beforeMessageId = page.beforeMessageId;

    if (!beforeMessageId) {
      break;
    }
  }

  await markSubscriptionScanSucceeded({
    channelTitle: latestChannelTitle,
    newestMessage,
    scanStartedAt,
    subscription,
    supabase,
  });

  return {
    candidatesCreated,
    ignoredCreated,
    messagesSeen,
    needsReviewCreated,
  };
}

async function fetchTelegramChannelPage(
  channelUsername: string,
  beforeMessageId?: number | null,
): Promise<TelegramChannelPage> {
  const url = beforeMessageId
    ? `${createTelegramChannelSourceUrl(channelUsername)}?before=${beforeMessageId}`
    : createTelegramChannelSourceUrl(channelUsername);
  const html = await fetchTelegramHtml(url);

  return parseTelegramChannelPage(html, channelUsername);
}

function parseTelegramChannelPage(
  html: string,
  channelUsername: string,
): TelegramChannelPage {
  const channelTitle = getChannelTitle(html, channelUsername);
  const beforeMessageId = getBeforeMessageId(html);
  const messageStarts = Array.from(
    html.matchAll(
      /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"/g,
    ),
  )
    .map((match) => ({
      dataPost: match[1],
      index: match.index ?? 0,
    }))
    .filter((item) => item.dataPost.startsWith(`${channelUsername}/`));
  const messages: TelegramChannelMessage[] = [];

  for (let index = 0; index < messageStarts.length; index += 1) {
    const current = messageStarts[index];
    const next = messageStarts[index + 1];
    const rawHtml = html.slice(current.index, next?.index ?? html.length);
    const messageId = Number.parseInt(current.dataPost.split("/")[1] ?? "", 10);

    if (!Number.isFinite(messageId)) {
      continue;
    }

    messages.push({
      createdAt: extractMessageDateTime(rawHtml),
      imageUrls: extractMessageImageUrls(rawHtml),
      messageId,
      rawHtml,
      sourceUrl: `https://t.me/${channelUsername}/${messageId}`,
      text: extractMessageText(rawHtml),
    });
  }

  return {
    beforeMessageId,
    channelTitle,
    messages,
  };
}

function getChannelTitle(html: string, channelUsername: string) {
  const title = normalizeText(getMetaContent(html, "og:title"))
    .replace(/^Telegram:\s*/i, "")
    .replace(/\s+on Telegram$/i, "")
    .trim();

  if (title && !title.toLowerCase().includes("telegram")) {
    return title;
  }

  const headerTitleMatch = html.match(
    /tgme_channel_info_header_title[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/,
  );
  const headerTitle = normalizeText(stripHtml(headerTitleMatch?.[1] ?? ""));

  return headerTitle || `@${channelUsername}`;
}

function getBeforeMessageId(html: string) {
  const match = html.match(/class="tme_messages_more[^"]*"[^>]*data-before="(\d+)"/);
  const value = Number.parseInt(match?.[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function extractMessageDateTime(rawHtml: string) {
  const match = rawHtml.match(/<time[^>]+datetime=["']([^"']+)["']/);
  const value = match?.[1];

  if (!value || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return new Date(Date.parse(value)).toISOString();
}

function extractMessageText(rawHtml: string) {
  const match = rawHtml.match(
    /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );

  return normalizeText(stripHtml(match?.[1] ?? ""));
}

function extractMessageImageUrls(rawHtml: string) {
  return extractTelegramMessageImageUrls(rawHtml);
}

function shouldCollectMessage(
  message: TelegramChannelMessage,
  subscription: TelegramChannelSubscription,
  cutoff: string,
) {
  if (!message.text.trim() && message.imageUrls.length === 0) {
    return false;
  }

  if (subscription.lastCheckedMessageId !== null) {
    return message.messageId > subscription.lastCheckedMessageId;
  }

  if (message.createdAt && message.createdAt < cutoff) {
    return false;
  }

  if (subscription.lastCheckedAt && message.createdAt) {
    return message.createdAt > subscription.lastCheckedAt;
  }

  return true;
}

async function upsertTelegramChannelCandidates({
  channelTitle,
  messages,
  subscription,
  supabase,
}: {
  channelTitle: string;
  messages: TelegramChannelMessage[];
  subscription: TelegramChannelSubscription;
  supabase: SupabaseClient;
}) {
  if (messages.length === 0) {
    return createEmptyTelegramCandidateInsertResult();
  }

  const mediaRows = messages.flatMap((message) =>
    message.imageUrls.map((imageUrl, index) => ({
      alt_text: `${channelTitle} ${message.messageId}`,
      media_key: createTelegramMediaKey(
        subscription.channelUsername,
        message.messageId,
        index,
      ),
      media_type: "photo",
      preview_image_url: imageUrl,
      raw_payload: {
        message_id: message.messageId,
        source_url: message.sourceUrl,
      },
      source_type: "telegram",
      url: imageUrl,
      last_seen_at: new Date().toISOString(),
    })),
  );

  if (mediaRows.length > 0) {
    const { error } = await supabase
      .from("source_media")
      .upsert(mediaRows, { onConflict: "media_key" });

    if (error) {
      throw new Error(error.message);
    }
  }

  const rows = messages.flatMap((message) => {
    const sourceRecordId = createTelegramSourceRecordId(
      subscription.channelUsername,
      message.messageId,
    );
    const mediaKeys = message.imageUrls.map((_imageUrl, index) =>
      createTelegramMediaKey(
        subscription.channelUsername,
        message.messageId,
        index,
      ),
    );
    const decision = evaluateTelegramCandidate({
      channelTitle,
      createdAt: message.createdAt,
      imageUrls: message.imageUrls,
      mediaKeys,
      sourceRecordId,
      text: message.text,
    });

    if (!decision.shouldCreate) {
      return [];
    }

    return [
      {
        extraction_payload: {
          source: TELEGRAM_CHANNEL_SCAN_SOURCE,
          source_type: "telegram",
          event_date_filter: decision.eventDateFilter,
          needs_ocr: decision.media.length > 0,
          telegram: {
            channel: subscription.channelUsername,
            message_created_at: message.createdAt,
            message_id: String(message.messageId),
            raw_html_length: message.rawHtml.length,
            subscription_id: subscription.id,
          },
        },
        media_keys: mediaKeys,
        review_reason: decision.reviewReason,
        source_name: channelTitle || `@${subscription.channelUsername}`,
        source_record_id: sourceRecordId,
        source_type: "telegram",
        source_url: message.sourceUrl,
        status: decision.status,
        text_snapshot: message.text,
        updated_at: new Date().toISOString(),
      },
    ];
  });

  if (rows.length === 0) {
    return createEmptyTelegramCandidateInsertResult();
  }

  const { data, error } = await supabase
    .from("review_candidates")
    .upsert(rows, {
      ignoreDuplicates: true,
      onConflict: "source_type,source_record_id",
    })
    .select("source_record_id");

  if (error) {
    throw new Error(error.message);
  }

  const insertedSourceRecordIds = new Set(
    ((data as { source_record_id?: string }[] | null) ?? [])
      .map((row) => row.source_record_id)
      .filter((value): value is string => Boolean(value)),
  );
  const insertedRows =
    insertedSourceRecordIds.size > 0
      ? rows.filter((row) => insertedSourceRecordIds.has(row.source_record_id))
      : [];

  return {
    candidatesCreated: insertedRows.length,
    ignoredCreated: insertedRows.filter((row) => row.status === "ignored").length,
    needsReviewCreated: insertedRows.filter(
      (row) => row.status === "needs_review",
    ).length,
  };
}

function createEmptyTelegramCandidateInsertResult() {
  return {
    candidatesCreated: 0,
    ignoredCreated: 0,
    needsReviewCreated: 0,
  };
}

async function markSubscriptionScanStarted(
  supabase: SupabaseClient,
  subscriptionId: string,
  startedAt: string,
) {
  const { error } = await supabase
    .from("telegram_channel_subscriptions")
    .update({
      last_scan_error: null,
      last_scan_started_at: startedAt,
      updated_at: startedAt,
    })
    .eq("id", subscriptionId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markSubscriptionScanSucceeded({
  channelTitle,
  newestMessage,
  scanStartedAt,
  subscription,
  supabase,
}: {
  channelTitle: string;
  newestMessage: Pick<TelegramChannelMessage, "createdAt" | "messageId"> | null;
  scanStartedAt: string;
  subscription: TelegramChannelSubscription;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();
  const values: Record<string, unknown> = {
    channel_title: channelTitle || subscription.channelTitle,
    last_checked_at: scanStartedAt,
    last_scan_error: null,
    last_scan_finished_at: now,
    updated_at: now,
  };

  if (newestMessage) {
    values.last_checked_message_id = newestMessage.messageId;
    values.last_checked_message_at = newestMessage.createdAt;
  }

  const { error } = await supabase
    .from("telegram_channel_subscriptions")
    .update(values)
    .eq("id", subscription.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function markSubscriptionScanFailed(
  supabase: SupabaseClient,
  subscriptionId: string,
  error: unknown,
) {
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("telegram_channel_subscriptions")
    .update({
      last_scan_error: error instanceof Error ? error.message : String(error),
      last_scan_finished_at: now,
      updated_at: now,
    })
    .eq("id", subscriptionId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

function shouldStopScanningPage(
  page: TelegramChannelPage,
  subscription: TelegramChannelSubscription,
  cutoff: string,
) {
  const oldestMessage = getOldestMessage(page.messages);

  if (!oldestMessage) {
    return true;
  }

  if (
    subscription.lastCheckedMessageId !== null &&
    oldestMessage.messageId <= subscription.lastCheckedMessageId
  ) {
    return true;
  }

  if (oldestMessage.createdAt && oldestMessage.createdAt < cutoff) {
    return true;
  }

  return false;
}

function getSubscriptionCutoff(
  subscription: TelegramChannelSubscription,
  now: string,
) {
  if (subscription.lastCheckedMessageId !== null) {
    return "1970-01-01T00:00:00.000Z";
  }

  return (
    subscription.lastCheckedMessageAt ??
    subscription.lastCheckedAt ??
    subtractDaysIso(now, NEW_CHANNEL_LOOKBACK_DAYS)
  );
}

function getCursorMessage(subscription: TelegramChannelSubscription) {
  if (subscription.lastCheckedMessageId === null) {
    return null;
  }

  return {
    createdAt: subscription.lastCheckedMessageAt,
    messageId: subscription.lastCheckedMessageId,
  };
}

function getNewestMessage(messages: TelegramChannelMessage[]) {
  return messages.reduce<Pick<TelegramChannelMessage, "createdAt" | "messageId"> | null>(
    (newest, message) => pickNewerMessage(newest, message),
    null,
  );
}

function getOldestMessage(messages: TelegramChannelMessage[]) {
  return messages.reduce<Pick<TelegramChannelMessage, "createdAt" | "messageId"> | null>(
    (oldest, message) => {
      if (!oldest) {
        return message;
      }

      return message.messageId < oldest.messageId ? message : oldest;
    },
    null,
  );
}

function pickNewerMessage<
  T extends Pick<TelegramChannelMessage, "createdAt" | "messageId">,
>(current: T | null, next: T | null) {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return next.messageId > current.messageId ? next : current;
}

function getMaxPagesPerChannel() {
  const parsed = Number.parseInt(
    process.env.TELEGRAM_CHANNEL_SCAN_MAX_PAGES ?? "",
    10,
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_PAGES_PER_CHANNEL;
}

function createTelegramChannelSourceUrl(channelUsername: string) {
  return `https://t.me/s/${channelUsername}`;
}

function createTelegramSourceRecordId(channelUsername: string, messageId: number) {
  return `telegram:${channelUsername}:${messageId}`;
}

function createTelegramMediaKey(
  channelUsername: string,
  messageId: number,
  index: number,
) {
  return `telegram:${channelUsername}:${messageId}:image:${index}`;
}

function evaluateTelegramCandidate({
  channelTitle,
  createdAt,
  imageUrls = [],
  mediaKeys,
  sourceRecordId,
  text,
}: {
  channelTitle: string;
  createdAt: string | null;
  imageUrls?: string[];
  mediaKeys: string[];
  sourceRecordId: string;
  text: string;
}): TelegramCandidateEvaluation {
  const media = mediaKeys.map((mediaKey, index) => ({
    alt_text: `${channelTitle} ${sourceRecordId}`.trim(),
    media_key: mediaKey,
    preview_image_url: imageUrls[index],
    type: "photo",
    url: imageUrls[index],
  })) satisfies XMedia[];
  const post = {
    attachments: mediaKeys.length > 0 ? { media_keys: mediaKeys } : undefined,
    created_at: createdAt ?? undefined,
    id: sourceRecordId,
    text,
  } satisfies XPost;
  const eventDateFilter = analyzePastEventNotice(text);
  const shouldReview =
    shouldReviewCandidate(post, media) && !eventDateFilter.ignoredAsPast;
  const status: "needs_review" | "ignored" = shouldReview
    ? "needs_review"
    : "ignored";
  const reviewReason = mergeReasons(
    [
      "telegram_channel_subscription",
      "telegram_auto_scan",
      ...(eventDateFilter.ignoredAsPast ? ["past_event_date"] : []),
    ],
    getCandidateReasons(post, media),
  );

  return {
    eventDateFilter,
    media,
    reviewReason,
    shouldCreate: shouldCreateCandidate(post, media),
    status,
  };
}

function mergeReasons(currentReasons: string[], nextReasons: string[]) {
  return Array.from(new Set([...currentReasons, ...nextReasons]));
}

function mapSubscriptionRow(
  row: TelegramSubscriptionRow,
): TelegramChannelSubscription {
  return {
    id: row.id,
    channelTitle: row.channel_title ?? `@${row.channel_username}`,
    channelUsername: row.channel_username,
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    lastCheckedMessageAt: row.last_checked_message_at,
    lastCheckedMessageId: row.last_checked_message_id,
    lastScanError: row.last_scan_error,
    lastScanFinishedAt: row.last_scan_finished_at,
    lastScanStartedAt: row.last_scan_started_at,
    sourceUrl: row.source_url,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function subtractDaysIso(value: string, days: number) {
  return new Date(Date.parse(value) - days * 24 * 60 * 60 * 1000).toISOString();
}

function isMissingTelegramSubscriptionTableError(error: { code?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}
