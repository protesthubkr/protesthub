type StatusCounts = Record<string, number>;

export type StatementBackfillRunOptions = {
  channelUsername?: string;
  dryRun?: boolean;
  extractionLimit?: number;
  extractionPasses?: number;
  partyLimit?: number;
  telegramMaxPages?: number;
  topicLimit?: number;
  windowHours?: number;
};

export type StatementBackfillRunResult = {
  counts: {
    partyByStatus: StatusCounts;
    partyVisible: number;
    publicVisible: number;
    telegramByStatus: StatusCounts;
    telegramVisible: number;
  };
  cutoffIso: string;
  dryRun: boolean;
  extraction: {
    extracted: number;
    failed: number;
    passes: Array<{
      extracted: number;
      failed: number;
      pass: number;
      pendingSeen: number;
      skipped: number;
    }>;
    pendingSeen: number;
    skipped: number;
  };
  options: Required<Omit<StatementBackfillRunOptions, "channelUsername">> & {
    channelUsername: string | null;
  };
  party: {
    detailsFetched: number;
    documentsSeen: number;
    extracted: number;
    failed: number;
    outsideWindow: number;
    skipped: number;
    stored: number;
  };
  telegram: {
    candidateMatches: number;
    candidatesCreated: number;
    channelsScanned: number;
    channelsSkipped: number;
    messagesSeen: number;
    messagesWritten: number;
  };
  topics: {
    confirmedTopics: number;
    embeddingsCreated: number;
    matchedPartyStatements: number;
    partyCandidatesSeen: number;
    partyUnmatched: number;
    telegramClusters: number;
    telegramSummariesSeen: number;
  };
  windowHours: number;
};

export type NormalizedStatementBackfillOptions =
  StatementBackfillRunResult["options"] & {
    cutoffIso: string;
  };
