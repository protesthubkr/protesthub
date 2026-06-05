import { Suspense } from "react";
import { HomePageClient } from "@/features/public-events/home-page-client";
import {
  getFilterSignature,
  parseEventFilters,
} from "@/features/public-events/filters";
import {
  getPublishedOrganizerOptions,
  getPublicEventOccurrenceWindow,
} from "@/lib/events";
import { getKoreanTodayDate } from "@/lib/format";

export const revalidate = 60;

type HomeSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function Home({
  searchParams,
}: {
  searchParams: HomeSearchParams;
}) {
  const params = await searchParams;
  const filters = parseEventFilters(toURLSearchParams(params));
  const fromDate = getKoreanTodayDate();
  const [initialWindow, organizers] = await Promise.all([
    getPublicEventOccurrenceWindow({ filters, fromDate }),
    getPublishedOrganizerOptions(),
  ]);

  return (
    <Suspense fallback={<main className="app-shell">불러오는 중</main>}>
      <HomePageClient
        key={getFilterSignature(filters)}
        filters={filters}
        initialWindow={initialWindow}
        organizers={organizers}
      />
    </Suspense>
  );
}

function toURLSearchParams(
  params: Record<string, string | string[] | undefined>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
      return;
    }

    if (value) {
      searchParams.set(key, value);
    }
  });

  return searchParams;
}
