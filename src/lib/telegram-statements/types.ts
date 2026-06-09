import type { TelegramChannelMessage } from "@/lib/telegram/channel-page";

export type TelegramStatementDocumentType =
  | "statement"
  | "commentary"
  | "position"
  | "press_release"
  | "press_conference"
  | "condemnation"
  | "welcome";

export type TelegramStatementFeedSubscription = {
  channelTitle: string;
  channelUsername: string;
  lastCheckedMessageAt: string | null;
  lastCheckedMessageId: number | null;
};

export type TelegramStatementScanState = {
  channelUsername: string;
  lastScannedAt: string | null;
  lastScannedMessageAt: string | null;
  lastScannedMessageId: number | null;
  lockedAt: string | null;
};

export type TelegramStatementCandidate = {
  detectionReason: string[];
  documentType: TelegramStatementDocumentType;
  message: TelegramChannelMessage;
};

export type TelegramStatementChannelResult = {
  candidatesCreated: number;
  candidateMatches: number;
  channelTitle: string;
  channelUsername: string;
  cursorMessageId: number | null;
  skippedBecauseLocked: boolean;
  messagesSeen: number;
  messagesWritten: number;
};

export type TelegramStatementScanResult = {
  backfill: boolean;
  candidatesCreated: number;
  candidateMatches: number;
  channelsScanned: number;
  channelsSkipped: number;
  cutoffIso: string | null;
  dryRun: boolean;
  messagesSeen: number;
  messagesWritten: number;
  results: TelegramStatementChannelResult[];
  runId: string | null;
  windowHours: number | null;
};

export type TelegramStatementRunOptions = {
  backfill?: boolean;
  channelUsername?: string;
  dryRun?: boolean;
  maxPagesPerChannel?: number;
  windowHours?: number;
};
