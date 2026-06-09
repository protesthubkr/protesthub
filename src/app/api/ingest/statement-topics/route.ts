import { NextRequest, NextResponse } from "next/server";
import { isBearerSecretAuthorized } from "@/lib/bearer-auth";
import {
  getStatementTopicErrorMessage,
  runStatementTopicMatching,
  type StatementTopicRunOptions,
} from "@/lib/statement-topics/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStatementTopicMatching(parseRunOptions(request));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StatementTopicRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Statement topic matching failed"
            : getStatementTopicErrorMessage(error),
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

function parseRunOptions(request: NextRequest): StatementTopicRunOptions {
  const searchParams = request.nextUrl.searchParams;

  return {
    dryRun: parseOptionalBoolean(searchParams.get("dryRun")) ?? false,
    limit: parseLimit(searchParams.get("limit")),
    windowHours: parseWindowHours(searchParams.get("windowHours")),
  };
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
    throw new StatementTopicRequestError("Invalid limit.");
  }

  return parsed;
}

function parseWindowHours(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168) {
    throw new StatementTopicRequestError("Invalid windowHours.");
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

  throw new StatementTopicRequestError("Invalid boolean option.");
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

class StatementTopicRequestError extends Error {}
