import { NextRequest, NextResponse } from "next/server";
import {
  runXIngest,
  XApiError,
  XIngestConfigError,
} from "@/lib/x-ingest/run";

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
    const result = await runXIngest();
    return NextResponse.json(result);
  } catch (error) {
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
