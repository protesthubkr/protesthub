const DEFAULT_TOPIC_WINDOW_HOURS = 48;
const DEFAULT_TELEGRAM_TOPIC_THRESHOLD = 0.4;
const DEFAULT_PARTY_TOPIC_THRESHOLD = 0.72;
const DEFAULT_CROSS_SOURCE_TOPIC_THRESHOLD = 0.4;
const DEFAULT_TOPIC_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TOPIC_EMBEDDING_DIMENSIONS = 512;
const DEFAULT_TOPIC_RUN_LIMIT = 100;

export function getStatementTopicWindowHours() {
  return readIntegerEnv("STATEMENT_TOPIC_WINDOW_HOURS", {
    defaultValue: DEFAULT_TOPIC_WINDOW_HOURS,
    max: 168,
    min: 1,
  });
}

export function getStatementTopicTelegramThreshold() {
  return readNumberEnv("STATEMENT_TOPIC_TELEGRAM_THRESHOLD", {
    defaultValue: DEFAULT_TELEGRAM_TOPIC_THRESHOLD,
    max: 0.99,
    min: 0.3,
  });
}

export function getStatementTopicPartyThreshold() {
  return readNumberEnv("STATEMENT_TOPIC_PARTY_THRESHOLD", {
    defaultValue: DEFAULT_PARTY_TOPIC_THRESHOLD,
    max: 0.99,
    min: 0.3,
  });
}

export function getStatementTopicCrossSourceThreshold() {
  return readNumberEnv("STATEMENT_TOPIC_CROSS_SOURCE_THRESHOLD", {
    defaultValue: DEFAULT_CROSS_SOURCE_TOPIC_THRESHOLD,
    max: 0.99,
    min: 0.3,
  });
}

export function getStatementTopicEmbeddingModel() {
  return (
    process.env.OPENAI_STATEMENT_TOPIC_EMBEDDING_MODEL?.trim() ||
    DEFAULT_TOPIC_EMBEDDING_MODEL
  );
}

export function getStatementTopicEmbeddingDimensions() {
  return readIntegerEnv("OPENAI_STATEMENT_TOPIC_EMBEDDING_DIMENSIONS", {
    defaultValue: DEFAULT_TOPIC_EMBEDDING_DIMENSIONS,
    max: 3072,
    min: 64,
  });
}

export function getStatementTopicRunLimit() {
  return readIntegerEnv("STATEMENT_TOPIC_RUN_LIMIT", {
    defaultValue: DEFAULT_TOPIC_RUN_LIMIT,
    max: 500,
    min: 1,
  });
}

function readIntegerEnv(
  key: string,
  {
    defaultValue,
    max,
    min,
  }: {
    defaultValue: number;
    max: number;
    min: number;
  },
) {
  const value = process.env[key];

  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, min), max);
}

function readNumberEnv(
  key: string,
  {
    defaultValue,
    max,
    min,
  }: {
    defaultValue: number;
    max: number;
    min: number;
  },
) {
  const value = process.env[key];

  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, min), max);
}
