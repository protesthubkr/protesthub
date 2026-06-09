import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupePostsById } from "./repository-utils";
import type { XMedia, XPost } from "./types";

type PostAttachmentMediaKeysRow = {
  attachment_media_keys: string[] | null;
  x_post_id: string;
};

export async function getAttachmentMediaKeysByPostId(
  supabase: SupabaseClient,
  postIds: string[],
) {
  const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));

  if (uniquePostIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data, error } = await supabase
    .from("x_posts")
    .select("x_post_id,attachment_media_keys")
    .in("x_post_id", uniquePostIds);

  if (error || !data) {
    return new Map<string, string[]>();
  }

  return new Map(
    (data as unknown as PostAttachmentMediaKeysRow[]).map((row) => [
      row.x_post_id,
      row.attachment_media_keys ?? [],
    ]),
  );
}

export async function upsertMedia(
  supabase: SupabaseClient,
  media: XMedia[],
) {
  if (media.length === 0) {
    return;
  }

  const { error } = await supabase.from("source_media").upsert(
    media.map((item) => ({
      media_key: item.media_key,
      source_type: "x",
      media_type: item.type,
      url: item.url ?? null,
      preview_image_url: item.preview_image_url ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      alt_text: item.alt_text ?? null,
      raw_payload: item,
      last_seen_at: new Date().toISOString(),
    })),
    { onConflict: "media_key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertPostMedia(
  supabase: SupabaseClient,
  posts: XPost[],
  knownMediaKeys?: Set<string>,
) {
  const rows = Array.from(
    new Map(
      dedupePostsById(posts)
        .flatMap((post) =>
          (post.attachments?.media_keys ?? [])
            .filter((mediaKey) => !knownMediaKeys || knownMediaKeys.has(mediaKey))
            .map((mediaKey, index) => ({
              x_post_id: post.id,
              media_key: mediaKey,
              media_order: index,
            })),
        )
        .map((row) => [`${row.x_post_id}:${row.media_key}`, row]),
    ).values(),
  );

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("x_post_media")
    .upsert(rows, { onConflict: "x_post_id,media_key" });

  if (error) {
    throw new Error(error.message);
  }
}
