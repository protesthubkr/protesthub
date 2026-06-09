import { NextRequest, NextResponse } from "next/server";
import { isBearerSecretAuthorized } from "@/lib/bearer-auth";
import { runPartyStatementIngest } from "@/lib/party-statements/run";
import type {
  PartyStatementRunOptions,
  PartyStatementSourceKey,
} from "@/lib/party-statements/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPartyStatementIngest(parseRunOptions(request));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PartyStatementRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Party statement ingest failed"
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

function parseRunOptions(request: NextRequest): PartyStatementRunOptions {
  const searchParams = request.nextUrl.searchParams;

  return {
    dryRun: parseOptionalBoolean(searchParams.get("dryRun")) ?? false,
    limit: parseLimit(searchParams.get("limit")),
    source: parseSource(searchParams.get("source")) ?? undefined,
    windowHours: parseWindowHours(searchParams.get("windowHours")),
  };
}

function parseSource(value: string | null): PartyStatementSourceKey | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized === "people_power_party" ||
    normalized === "theminjoo" ||
    normalized === "reform_party"
  ) {
    return normalized;
  }

  throw new PartyStatementRequestError("Invalid source.");
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 200) {
    throw new PartyStatementRequestError("Invalid limit.");
  }

  return parsed;
}

function parseWindowHours(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168) {
    throw new PartyStatementRequestError("Invalid windowHours.");
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

  throw new PartyStatementRequestError("Invalid boolean option.");
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

class PartyStatementRequestError extends Error {}
