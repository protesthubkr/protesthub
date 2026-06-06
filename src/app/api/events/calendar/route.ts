import { NextResponse, type NextRequest } from "next/server";
import {
  parseEventFilters,
  parseMonthParam,
} from "@/features/public-events/filters";
import { getPublicEventCalendarMonth } from "@/lib/events";
import { getKoreanTodayDate, getMonthKey } from "@/lib/format";

const PUBLIC_CALENDAR_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const filters = parseEventFilters(request.nextUrl.searchParams);
  const month =
    parseMonthParam(request.nextUrl.searchParams.get("month")) ??
    getMonthKey(getKoreanTodayDate());
  const calendarMonth = await getPublicEventCalendarMonth({ filters, month });

  return NextResponse.json(calendarMonth, {
    headers: {
      "Cache-Control": PUBLIC_CALENDAR_CACHE_CONTROL,
    },
  });
}
