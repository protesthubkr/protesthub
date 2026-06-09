import type { TelegramStatementDocumentType } from "@/lib/telegram-statements/types";

export type PartyStatementSourceKey =
  | "people_power_party"
  | "theminjoo"
  | "reform_party";

export type PartyStatementSourceDefinition = {
  allowInsecureTls?: boolean;
  listUrl: string;
  organizationName: string;
  sourceKey: PartyStatementSourceKey;
};

export type PartyStatementListItem = {
  documentType: TelegramStatementDocumentType;
  externalId: string;
  publishedAt: string | null;
  rawCategory: string;
  sourceKey: PartyStatementSourceKey;
  sourceUrl: string;
  title: string;
};

export type PartyStatementDocument = PartyStatementListItem & {
  organizationName: string;
  textSnapshot: string;
};

export type PartyStatementSourceParser = PartyStatementSourceDefinition & {
  parseDetail: (
    html: string,
    listItem: PartyStatementListItem,
  ) => PartyStatementDocument | null;
  parseList: (html: string) => PartyStatementListItem[];
};

export type PartyStatementRunOptions = {
  dryRun?: boolean;
  limit?: number;
  source?: PartyStatementSourceKey;
  windowHours?: number;
};
