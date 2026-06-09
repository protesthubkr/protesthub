export type PartyStatementRunOutcome = {
  documentType?: string;
  externalId?: string;
  organizationName: string;
  sourceKey: string;
  sourceUrl?: string;
  status:
    | "seen"
    | "stored"
    | "extracted"
    | "skipped"
    | "failed"
    | "already_extracted";
  title?: string;
};

export type PartyStatementRunSourceResult = {
  detailsFetched: number;
  documentsSeen: number;
  extracted: number;
  failed: number;
  outcomes: PartyStatementRunOutcome[];
  outsideWindow: number;
  skipped: number;
  sourceKey: string;
  stored: number;
};

export type PartyStatementRunResult = {
  cutoffIso: string | null;
  dryRun: boolean;
  extracted: number;
  failed: number;
  outsideWindow: number;
  results: PartyStatementRunSourceResult[];
  skipped: number;
  sourcesSeen: number;
  stored: number;
};

export type PartyStatementExtractionStatus = "extracted" | "failed" | "skipped";
