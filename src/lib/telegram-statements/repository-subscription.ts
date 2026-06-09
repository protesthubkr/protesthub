import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramStatementFeedSubscription } from "./types";
import type { StatementFeedSubscriptionRow } from "./repository-scan-types";

const STATEMENT_FEED_SUBSCRIPTION_SELECT = [
  "channel_username",
  "channel_title",
  "last_checked_message_id",
  "last_checked_message_at",
].join(",");

export async function getStatementFeedSubscriptions({
  channelUsername,
  supabase,
}: {
  channelUsername?: string;
  supabase: SupabaseClient;
}) {
  let query = supabase
    .from("telegram_channel_subscriptions")
    .select(STATEMENT_FEED_SUBSCRIPTION_SELECT)
    .eq("status", "active")
    .eq("statement_feed_enabled", true)
    .order("channel_username", { ascending: true });

  if (channelUsername) {
    query = query.eq("channel_username", channelUsername);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data as unknown as StatementFeedSubscriptionRow[] | null) ?? []).map(
    mapSubscriptionRow,
  );
}

function mapSubscriptionRow(
  row: StatementFeedSubscriptionRow,
): TelegramStatementFeedSubscription {
  return {
    channelTitle: row.channel_title ?? `@${row.channel_username}`,
    channelUsername: row.channel_username,
    lastCheckedMessageAt: row.last_checked_message_at,
    lastCheckedMessageId: row.last_checked_message_id,
  };
}
