import { getSupabaseClient } from "@/lib/supabase";
import {
  compareStatementItemsNewestFirst,
  compareStatementItemsOldestFirst,
} from "./public-feed-time";
import {
  getPublicPartyStatementItems,
  getPublicTelegramStatementItems,
} from "./public-feed-sources";
import type { PublicStatementFeedItem } from "./public-feed-types";

export type {
  PartyStatementSummaryPublicRow,
  PublicStatementFeedItem,
  StatementSummaryPublicRow,
} from "./public-feed-types";

export async function getPublicStatementFeedItems(limit = 100) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [] satisfies PublicStatementFeedItem[];
  }

  const telegramItems = await getPublicTelegramStatementItems(limit);
  const partyItems = await getPublicPartyStatementItems(limit);

  return [...telegramItems, ...partyItems]
    .sort(compareStatementItemsNewestFirst)
    .slice(0, limit)
    .sort(compareStatementItemsOldestFirst);
}
