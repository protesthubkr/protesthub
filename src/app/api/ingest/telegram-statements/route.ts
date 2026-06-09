import { NextRequest, NextResponse } from "next/server";
import { isBearerSecretAuthorized } from "@/lib/bearer-auth";
import { runTelegramStatementFeedScan } from "@/lib/telegram-statements/run";
import type { TelegramStatementRunOptions } from "@/lib/telegram-statements/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTelegramStatementFeedScan(parseRunOptions(request));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TelegramStatementIngestRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Telegram statement ingest failed"
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}

function isAuthorized(request: NextRequest) {
  return isBearerSecretAuthorized(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
}

function parseRunOptions(request: NextRequest): TelegramStatementRunOptions {
  const searchParams = request.nextUrl.searchParams;

  return {
    backfill: parseOptionalBoolean(searchParams.get("backfill")) ?? false,
    channelUsername:
      normalizeChannelUsername(searchParams.get("channel")) ?? undefined,
    dryRun: parseOptionalBoolean(searchParams.get("dryRun")) ?? false,
    maxPagesPerChannel: parseMaxPages(searchParams.get("maxPages")),
    windowHours: parseWindowHours(searchParams.get("windowHours")),
  };
}

function normalizeChannelUsername(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/^@/, "").toLowerCase();

  if (!/^[a-z0-9_]{4,64}$/.test(normalized)) {
    throw new TelegramStatementIngestRequestError("Invalid channel.");
  }

  return normalized;
}

function parseMaxPages(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 200) {
    throw new TelegramStatementIngestRequestError("Invalid maxPages.");
  }

  return parsed;
}

function parseWindowHours(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168) {
    throw new TelegramStatementIngestRequestError("Invalid windowHours.");
  }

  return parsed;
}

function parseOptionalBoolean(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new TelegramStatementIngestRequestError("Invalid boolean option.");
}

function methodNotAllowed(allowedMethods: string[]) {
  return NextResponse.json(
    { error: "Method Not Allowed" },
    {
      headers: {
        Allow: allowedMethods.join(", "),
      },
      status: 405,
    },
  );
}

class TelegramStatementIngestRequestError extends Error {}
