import { NextRequest, NextResponse } from "next/server";
import { isBearerSecretAuthorized } from "@/lib/bearer-auth";
import {
  runStatementBackfill,
  type StatementBackfillRunOptions,
} from "@/lib/statement-backfill/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStatementBackfill(parseRunOptions(request));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StatementBackfillRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Statement backfill failed"
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

function parseRunOptions(request: NextRequest): StatementBackfillRunOptions {
  const searchParams = request.nextUrl.searchParams;

  return {
    channelUsername:
      normalizeChannelUsername(searchParams.get("channel")) ?? undefined,
    dryRun: parseOptionalBoolean(searchParams.get("dryRun")) ?? true,
    extractionLimit: parseInteger(searchParams.get("extractionLimit"), {
      max: 500,
      min: 1,
      name: "extractionLimit",
    }),
    extractionPasses: parseInteger(searchParams.get("extractionPasses"), {
      max: 20,
      min: 1,
      name: "extractionPasses",
    }),
    partyLimit: parseInteger(searchParams.get("partyLimit"), {
      max: 500,
      min: 1,
      name: "partyLimit",
    }),
    telegramMaxPages: parseInteger(searchParams.get("maxPages"), {
      max: 200,
      min: 1,
      name: "maxPages",
    }),
    topicLimit: parseInteger(searchParams.get("topicLimit"), {
      max: 1000,
      min: 1,
      name: "topicLimit",
    }),
    windowHours: parseInteger(searchParams.get("windowHours"), {
      max: 168,
      min: 1,
      name: "windowHours",
    }),
  };
}

function normalizeChannelUsername(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/^@/, "").toLowerCase();

  if (!/^[a-z0-9_]{4,64}$/.test(normalized)) {
    throw new StatementBackfillRequestError("Invalid channel.");
  }

  return normalized;
}

function parseInteger(
  value: string | null,
  {
    max,
    min,
    name,
  }: {
    max: number;
    min: number;
    name: string;
  },
) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new StatementBackfillRequestError(`Invalid ${name}.`);
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

  throw new StatementBackfillRequestError("Invalid boolean option.");
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

class StatementBackfillRequestError extends Error {}
