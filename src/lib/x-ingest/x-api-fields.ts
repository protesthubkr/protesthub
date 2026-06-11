export const X_API_BASE_URL = "https://api.x.com/2";

export const USER_FIELDS = [
  "created_at",
  "description",
  "location",
  "name",
  "profile_image_url",
  "protected",
  "public_metrics",
  "verified",
  "verified_type",
  "username",
].join(",");

export const TWEET_FIELDS = [
  "attachments",
  "author_id",
  "conversation_id",
  "created_at",
  "edit_history_tweet_ids",
  "entities",
  "note_tweet",
  "referenced_tweets",
  "text",
].join(",");

export const TWEET_DETAIL_EXPANSIONS = [
  "attachments.media_keys",
  "author_id",
  "referenced_tweets.id",
  "referenced_tweets.id.author_id",
  "referenced_tweets.id.attachments.media_keys",
].join(",");

export const MEDIA_FIELDS = [
  "alt_text",
  "height",
  "media_key",
  "preview_image_url",
  "type",
  "url",
  "width",
].join(",");
