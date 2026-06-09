import { NextRequest, NextResponse } from "next/server";
import { isBearerSecretAuthorized } from "@/lib/bearer-auth";
import {
  runStatementQualityReview,
  type StatementQualityReviewOptions,
} from "@/lib/statement-quality/review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStatementQualityReview(parseRunOptions(request));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StatementQualityReviewRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Statement quality review failed"
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

function parseRunOptions(request: NextRequest): StatementQualityReviewOptions {
  const searchParams = request.nextUrl.searchParams;

  return {
    dryRun: parseOptionalBoolean(searchParams.get("dryRun")) ?? true,
    limit: parseInteger(searchParams.get("limit"), {
      max: 1000,
      min: 1,
      name: "limit",
    }),
    source: parseSource(searchParams.get("source")) ?? undefined,
    windowHours: parseInteger(searchParams.get("windowHours"), {
      max: 168,
      min: 1,
      name: "windowHours",
    }),
  };
}

function parseSource(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized === "all" ||
    normalized === "telegram" ||
    normalized === "party"
  ) {
    return normalized;
  }

  throw new StatementQualityReviewRequestError("Invalid source.");
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
    throw new StatementQualityReviewRequestError(`Invalid ${name}.`);
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

  throw new StatementQualityReviewRequestError("Invalid boolean option.");
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

class StatementQualityReviewRequestError extends Error {}
