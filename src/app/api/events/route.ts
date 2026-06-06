import { NextResponse, type NextRequest } from "next/server";
import {
  parseDateParam,
  parseEventFilters,
} from "@/features/public-events/filters";
import { getPublicEventOccurrenceWindow } from "@/lib/events";
import {
  getPublicEventDatePolicy,
  resolvePublicEventListFromDate,
} from "@/lib/public-event-date-policy";

const PUBLIC_LIST_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const filters = parseEventFilters(request.nextUrl.searchParams);
  const { todayDate } = getPublicEventDatePolicy();
  const requestedFromDate =
    parseDateParam(request.nextUrl.searchParams.get("from"));
  const fromDate = resolvePublicEventListFromDate({
    requestedDate: requestedFromDate,
    todayDate,
  });
  const eventWindow = await getPublicEventOccurrenceWindow({
    filters,
    fromDate,
  });

  return NextResponse.json(eventWindow, {
    headers: {
      "Cache-Control": PUBLIC_LIST_CACHE_CONTROL,
    },
  });
}
