import type { XIngestConfig } from "./types";

const DEFAULT_POSTS_PER_ACCOUNT = 10;
const DEFAULT_MAX_FOLLOWING_ACCOUNTS = 100;
const DEFAULT_INCLUDE_REPLIES = false;

export class XIngestConfigError extends Error {
  constructor(readonly missingKeys: string[]) {
    super(`Missing X ingest configuration: ${missingKeys.join(", ")}`);
  }
}

export function getXIngestConfig(): XIngestConfig {
  const bearerToken = process.env.X_BEARER_TOKEN;
  const operatingUserId = process.env.X_OPERATING_USER_ID;
  const missingKeys: string[] = [];

  if (!bearerToken) {
    missingKeys.push("X_BEARER_TOKEN");
  }

  if (!operatingUserId) {
    missingKeys.push("X_OPERATING_USER_ID");
  }

  if (!bearerToken || !operatingUserId) {
    throw new XIngestConfigError(missingKeys);
  }

  return {
    bearerToken,
    operatingUserId,
    postsPerAccount: parseBoundedInteger(
      process.env.X_POSTS_PER_ACCOUNT,
      DEFAULT_POSTS_PER_ACCOUNT,
      5,
      100,
    ),
    maxFollowingAccounts: parseBoundedInteger(
      process.env.X_MAX_FOLLOWING_ACCOUNTS,
      DEFAULT_MAX_FOLLOWING_ACCOUNTS,
      1,
      1000,
    ),
    includeReplies: parseBoolean(
      process.env.X_INCLUDE_REPLIES,
      DEFAULT_INCLUDE_REPLIES,
    ),
  };
}

function parseBoundedInteger(
  rawValue: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
) {
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, min), max);
}

function parseBoolean(rawValue: string | undefined, defaultValue: boolean) {
  if (!rawValue) {
    return defaultValue;
  }

  return ["1", "true", "yes", "y", "on"].includes(rawValue.toLowerCase());
}
