import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramChannelMessage } from "./channel-page";
import { upsertTelegramChannelMedia } from "./channel-candidate-media";
import {
  createEmptyTelegramCandidateInsertResult,
  upsertTelegramCandidateRows,
} from "./channel-candidate-repository";
import {
  createTelegramCandidateRows,
  dedupeTelegramCandidateRows,
} from "./channel-candidate-rows";
import type {
  TelegramChannelCandidateInsertResult,
  TelegramChannelSubscription,
} from "./channel-subscription-types";

export async function upsertTelegramChannelCandidates({
  channelTitle,
  messages,
  subscription,
  supabase,
}: {
  channelTitle: string;
  messages: TelegramChannelMessage[];
  subscription: TelegramChannelSubscription;
  supabase: SupabaseClient;
}): Promise<TelegramChannelCandidateInsertResult> {
  if (messages.length === 0) {
    return createEmptyTelegramCandidateInsertResult();
  }

  await upsertTelegramChannelMedia({
    channelTitle,
    messages,
    subscription,
    supabase,
  });

  const rows = dedupeTelegramCandidateRows(
    messages.flatMap((message) =>
      createTelegramCandidateRows({
        channelTitle,
        message,
        subscription,
      }),
    ),
  );

  if (rows.length === 0) {
    return createEmptyTelegramCandidateInsertResult();
  }

  return upsertTelegramCandidateRows({ rows, supabase });
}
