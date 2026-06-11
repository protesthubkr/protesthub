import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramChannelMessage } from "./channel-page";
import { createTelegramMediaKey } from "./channel-candidate-keys";
import type { TelegramChannelSubscription } from "./channel-subscription-types";

export async function upsertTelegramChannelMedia({
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

  if (mediaRows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("source_media")
    .upsert(mediaRows, { onConflict: "media_key" });

  if (error) {
    throw new Error(error.message);
  }
}
