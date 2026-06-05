import { NextResponse, type NextRequest } from "next/server";
import { parseEventFilters } from "@/features/public-events/filters";
import { getPublicEventOccurrenceWindow } from "@/lib/events";
import { getKoreanTodayDate } from "@/lib/format";

const PUBLIC_LIST_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const filters = parseEventFilters(request.nextUrl.searchParams);
  const fromDate =
    parseDateParam(request.nextUrl.searchParams.get("from")) ??
    getKoreanTodayDate();
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

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return value;
}
