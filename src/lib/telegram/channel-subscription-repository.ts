import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createTelegramChannelSourceUrl, fetchTelegramChannelPage } from "./channel-page";
import {
  isMissingTelegramSubscriptionTableError,
  mapTelegramSubscriptionRow,
  TELEGRAM_CHANNEL_SUBSCRIPTION_SELECT,
  type TelegramChannelCursorMessage,
  type TelegramChannelSubscription,
  type TelegramChannelSubscriptionStatus,
  type TelegramSubscriptionRow,
} from "./channel-subscription-types";

export async function getTelegramChannelSubscriptions() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return [] satisfies TelegramChannelSubscription[];
  }

  const { data, error } = await supabase
    .from("telegram_channel_subscriptions")
    .select(TELEGRAM_CHANNEL_SUBSCRIPTION_SELECT)
    .order("status", { ascending: true })
    .order("channel_username", { ascending: true });

  if (error) {
    if (isMissingTelegramSubscriptionTableError(error)) {
      return [] satisfies TelegramChannelSubscription[];
    }

    throw new Error(error.message);
  }

  return mapTelegramSubscriptionRows(data);
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

export async function getScannableTelegramChannelSubscriptions(
  supabase: SupabaseClient,
  subscriptionId?: string,
) {
  let query = supabase
    .from("telegram_channel_subscriptions")
    .select(TELEGRAM_CHANNEL_SUBSCRIPTION_SELECT)
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

  return mapTelegramSubscriptionRows(data);
}

export async function markTelegramSubscriptionScanStarted(
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

export async function markTelegramSubscriptionScanSucceeded({
  channelTitle,
  newestMessage,
  scanStartedAt,
  subscription,
  supabase,
}: {
  channelTitle: string;
  newestMessage: TelegramChannelCursorMessage | null;
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

export async function markTelegramSubscriptionScanFailed(
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

function mapTelegramSubscriptionRows(
  data: unknown[] | TelegramSubscriptionRow[] | null,
) {
  return ((data as TelegramSubscriptionRow[] | null) ?? []).map(
    mapTelegramSubscriptionRow,
  );
}
