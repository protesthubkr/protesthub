export const TELEGRAM_MANUAL_LINK_STRATEGY = "manual_telegram_message_link";

export type TelegramMessageLink = {
  channel: string;
  externalId: string;
  messageId: string;
  sourceRecordId: string;
  sourceUrl: string;
};

export type TelegramPreview = {
  description: string;
  imageUrl: string;
  sourceName: string;
  title: string;
};

export type ExistingCandidateRow = {
  id: string;
  review_reason: string[];
};

export type ManualTelegramLinkResult = {
  candidateId: string;
  created: boolean;
  sourceName: string;
  sourceUrl: string;
};
