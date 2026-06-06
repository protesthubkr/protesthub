import { NextRequest, NextResponse } from "next/server";
import {
  runXIngest,
  XApiError,
  XIngestConfigError,
} from "@/lib/x-ingest/run";
import type { XIngestRunOptions } from "@/lib/x-ingest/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleIngestRequest(request);
}

export async function POST(request: NextRequest) {
  return handleIngestRequest(request);
}

async function handleIngestRequest(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const options = parseRunOptions(request.nextUrl.searchParams);
    const result = await runXIngest(options);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof XIngestRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof XIngestConfigError) {
      return NextResponse.json(
        {
          error: "Missing ingest configuration",
          missingKeys: error.missingKeys,
        },
        { status: 400 },
      );
    }

    if (error instanceof XApiError) {
      return NextResponse.json(
        {
          error: "X API request failed",
          status: error.status,
          payload: error.payload,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;

  if (!secret && process.env.NODE_ENV !== "production") {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

class XIngestRequestError extends Error {}

function parseRunOptions(searchParams: URLSearchParams): XIngestRunOptions {
  return {
    hydrateMode: parseHydrateMode(searchParams.get("hydrateMode")),
    maxTimelinePagesPerAccount: parseMaxTimelinePages(
      searchParams.get("maxPages"),
    ),
    refreshFollowing: parseOptionalBoolean(
      searchParams.get("refreshFollowing") ?? searchParams.get("refreshAccounts"),
    ),
    reviewPastEventNotices: parseOptionalBoolean(
      searchParams.get("reviewPast"),
    ),
    startTime: parseStartTime(searchParams),
  };
}

function parseHydrateMode(value: string | null) {
  if (!value) {
    return undefined;
  }

  if (value === "deferred" || value === "candidate_posts_only") {
    return value;
  }

  throw new XIngestRequestError("Invalid hydrateMode.");
}

function parseStartTime(searchParams: URLSearchParams) {
  const startTime = searchParams.get("startTime");

  if (startTime) {
    const timestamp = Date.parse(startTime);

    if (!Number.isFinite(timestamp)) {
      throw new XIngestRequestError("Invalid startTime.");
    }

    return new Date(timestamp).toISOString();
  }

  const startDate = searchParams.get("startDate");

  if (!startDate) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new XIngestRequestError("Invalid startDate.");
  }

  return new Date(`${startDate}T00:00:00+09:00`).toISOString();
}

function parseMaxTimelinePages(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 25) {
    throw new XIngestRequestError("Invalid maxPages.");
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

  throw new XIngestRequestError("Invalid boolean option.");
}
