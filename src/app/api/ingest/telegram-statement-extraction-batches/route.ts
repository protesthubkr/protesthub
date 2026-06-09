import { NextRequest, NextResponse } from "next/server";
import { isBearerSecretAuthorized } from "@/lib/bearer-auth";
import {
  createTelegramStatementExtractionBatch,
  syncTelegramStatementExtractionBatch,
  type TelegramStatementExtractionBatchCreateOptions,
} from "@/lib/telegram-statements/batch";
import {
  TelegramStatementExtractionConfigError,
  TelegramStatementExtractionRequestError,
} from "@/lib/telegram-statements/extractor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await createTelegramStatementExtractionBatch(
      parseCreateOptions(request),
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error, "Telegram statement extraction batch failed");
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const openaiBatchId = normalizeBatchId(
      request.nextUrl.searchParams.get("batchId"),
    );

    if (!openaiBatchId) {
      throw new TelegramStatementExtractionBatchRequestError(
        "Missing batchId.",
      );
    }

    const result = await syncTelegramStatementExtractionBatch({
      importResults:
        parseOptionalBoolean(request.nextUrl.searchParams.get("importResults")) ??
        false,
      openaiBatchId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error, "Telegram statement extraction batch sync failed");
  }
}

function isAuthorized(request: NextRequest) {
  return isBearerSecretAuthorized(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
}

function parseCreateOptions(
  request: NextRequest,
): TelegramStatementExtractionBatchCreateOptions {
  const searchParams = request.nextUrl.searchParams;

  return {
    dryRun: parseOptionalBoolean(searchParams.get("dryRun")) ?? false,
    limit: parseLimit(searchParams.get("limit")),
    summaryId: normalizeUuid(searchParams.get("summaryId")) ?? undefined,
  };
}

function normalizeBatchId(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!/^batch_[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new TelegramStatementExtractionBatchRequestError("Invalid batchId.");
  }

  return normalized;
}

function normalizeUuid(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new TelegramStatementExtractionBatchRequestError(
      "Invalid summaryId.",
    );
  }

  return normalized;
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
    throw new TelegramStatementExtractionBatchRequestError("Invalid limit.");
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

  throw new TelegramStatementExtractionBatchRequestError(
    "Invalid boolean option.",
  );
}

function handleError(error: unknown, productionMessage: string) {
  if (error instanceof TelegramStatementExtractionBatchRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof TelegramStatementExtractionConfigError) {
    return NextResponse.json({ error: "Missing OpenAI API key." }, { status: 500 });
  }

  if (error instanceof TelegramStatementExtractionRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      error:
        process.env.NODE_ENV === "production"
          ? productionMessage
          : error instanceof Error
            ? error.message
            : String(error),
    },
    { status: 500 },
  );
}

class TelegramStatementExtractionBatchRequestError extends Error {}
