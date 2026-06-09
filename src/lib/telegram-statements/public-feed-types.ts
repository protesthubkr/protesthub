export type PublicStatementFeedItem = {
  coreSentence: string;
  documentType: string;
  id: string;
  isTimeUnknown: boolean;
  messageCreatedAt: string | null;
  organizationName: string;
  sourceUrl: string;
  sourceType: "party" | "telegram";
};

export type StatementSummaryPublicRow = {
  core_sentence: string | null;
  document_type: string;
  extraction_confidence: number | null;
  id: string;
  message_created_at: string | null;
  organization_name: string;
  source_url: string;
};

export type PartyStatementSummaryPublicRow = {
  core_sentence: string | null;
  created_at: string | null;
  document_type: string;
  extraction_confidence: number | null;
  id: string;
  organization_name: string;
  published_at: string | null;
  source_url: string;
  topic_gate_status: string;
};
