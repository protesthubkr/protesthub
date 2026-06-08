import { NextRequest, NextResponse } from "next/server";
import { isBearerSecretAuthorized } from "@/lib/bearer-auth";
import {
  broadcastPendingTelegramEvents,
  broadcastPublishedEventToTelegram,
} from "@/lib/telegram/event-broadcasts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorizedWithSecret(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await broadcastPendingTelegramEvents();
    return NextResponse.json(result);
  } catch (error) {
    return getBroadcastFailureResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedWithSecret(request, process.env.BROADCAST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleTelegramBroadcastRequest(request);
}

async function handleTelegramBroadcastRequest(request: NextRequest) {
  try {
    const options = await parseBroadcastOptions(request);
    const result = options.eventId
      ? await broadcastPublishedEventToTelegram(options.eventId, {
          dryRun: options.dryRun,
          targetDate: options.targetDate,
        })
      : await broadcastPendingTelegramEvents({
          dryRun: options.dryRun,
          limit: options.limit,
          targetDate: options.targetDate,
        });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TelegramBroadcastRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return getBroadcastFailureResponse(error);
  }
}

function isAuthorizedWithSecret(
  request: NextRequest,
  secret: string | undefined,
) {
  return isBearerSecretAuthorized(
    request.headers.get("authorization"),
    secret,
  );
}

function getBroadcastFailureResponse(error: unknown) {
  return NextResponse.json(
    {
      error:
        process.env.NODE_ENV === "production"
          ? "Telegram broadcast failed"
          : error instanceof Error
            ? error.message
            : String(error),
    },
    { status: 500 },
  );
}

class TelegramBroadcastRequestError extends Error {}

async function parseBroadcastOptions(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const body = request.method === "POST" ? await parseJsonBody(request) : {};
  const eventId = getStringOption(body.eventId) ?? searchParams.get("eventId");
  const limitValue = getStringOption(body.limit) ?? searchParams.get("limit");
  const targetDateValue =
    getStringOption(body.targetDate) ?? searchParams.get("targetDate");
  const dryRunValue =
    getStringOption(body.dryRun) ?? searchParams.get("dryRun");

  return {
    dryRun: parseOptionalBoolean(dryRunValue) ?? false,
    eventId: eventId?.trim() || undefined,
    limit: parseLimit(limitValue),
    targetDate: parseTargetDate(targetDateValue),
  };
}

async function parseJsonBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {} as Record<string, unknown>;
  }

  const body = (await request.json()) as unknown;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TelegramBroadcastRequestError("Invalid JSON body.");
  }

  return body as Record<string, unknown>;
}

function getStringOption(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

function parseLimit(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
    throw new TelegramBroadcastRequestError("Invalid limit.");
  }

  return parsed;
}

function parseTargetDate(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TelegramBroadcastRequestError("Invalid targetDate.");
  }

  return value;
}

function parseOptionalBoolean(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new TelegramBroadcastRequestError("Invalid boolean option.");
}
