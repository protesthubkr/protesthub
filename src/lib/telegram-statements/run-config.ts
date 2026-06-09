import type { TelegramStatementScanState } from "./types";

const DEFAULT_MAX_PAGES_PER_CHANNEL = 3;
const DEFAULT_BACKFILL_MAX_PAGES_PER_CHANNEL = 60;
const DEFAULT_BOOTSTRAP_HOURS = 24;
const LOCK_TTL_MINUTES = 9;

export function isStateLocked(state: TelegramStatementScanState | null) {
  if (!state?.lockedAt) {
    return false;
  }

  const lockedAt = Date.parse(state.lockedAt);

  if (!Number.isFinite(lockedAt)) {
    return false;
  }

  return Date.now() - lockedAt < LOCK_TTL_MINUTES * 60 * 1000;
}

export function getMaxPagesPerChannel({
  backfill,
  optionValue,
}: {
  backfill: boolean;
  optionValue: number | undefined;
}) {
  if (optionValue) {
    return optionValue;
  }

  const value = Number.parseInt(
    process.env.TELEGRAM_STATEMENT_SCAN_MAX_PAGES ?? "",
    10,
  );

  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return backfill
    ? DEFAULT_BACKFILL_MAX_PAGES_PER_CHANNEL
    : DEFAULT_MAX_PAGES_PER_CHANNEL;
}

export function getBootstrapHours() {
  const value = Number.parseInt(
    process.env.TELEGRAM_STATEMENT_SCAN_BOOTSTRAP_HOURS ?? "",
    10,
  );

  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_BOOTSTRAP_HOURS;
}

export function getWindowHours(optionValue: number | undefined) {
  if (optionValue) {
    return optionValue;
  }

  const value = Number.parseInt(
    process.env.TELEGRAM_STATEMENT_BACKFILL_WINDOW_HOURS ?? "",
    10,
  );

  return Number.isFinite(value) && value > 0 ? value : 48;
}
