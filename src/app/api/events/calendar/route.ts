import { NextResponse, type NextRequest } from "next/server";
import {
  hasNoEventFilters,
  parseEventFilters,
  parseMonthParam,
} from "@/features/public-events/filters";
import { getPublicEventCalendarMonth } from "@/lib/events";
import {
  getPublicEventDatePolicy,
  resolvePublicEventCalendarMonth,
} from "@/lib/public-event-date-policy";

const PUBLIC_CALENDAR_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";
const PUBLIC_UNFILTERED_CALENDAR_CACHE_CONTROL =
  "public, s-maxage=300, stale-while-revalidate=1800";

export async function GET(request: NextRequest) {
  const filters = parseEventFilters(request.nextUrl.searchParams);
  const { todayDate } = getPublicEventDatePolicy();
  const requestedMonth = parseMonthParam(
    request.nextUrl.searchParams.get("month"),
  );
  const month = resolvePublicEventCalendarMonth({
    requestedDate: null,
    requestedMonth,
    todayDate,
  });
  const calendarMonth = await getPublicEventCalendarMonth({
    filters,
    minDate: todayDate,
    month,
  });

  return NextResponse.json(calendarMonth, {
    headers: {
      "Cache-Control": hasNoEventFilters(filters)
        ? PUBLIC_UNFILTERED_CALENDAR_CACHE_CONTROL
        : PUBLIC_CALENDAR_CACHE_CONTROL,
    },
  });
}
