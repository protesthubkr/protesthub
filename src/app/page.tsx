import { Suspense } from "react";
import { CalendarPageClient } from "@/features/public-events/calendar-page-client";
import {
  getPublicEventsHomePageData,
  type HomeSearchParams,
} from "@/features/public-events/home-page-data";
import { LoadingState } from "@/features/public-events/loading-state";

export const revalidate = 60;

type HomeSearchParamsPromise = Promise<HomeSearchParams>;

export default async function Home({
  searchParams,
}: {
  searchParams: HomeSearchParamsPromise;
}) {
  const clientProps = await getPublicEventsHomePageData(
    await searchParams,
    "calendar",
  );

  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <LoadingState />
        </main>
      }
    >
      <CalendarPageClient
        calendarMonth={clientProps.calendarMonth}
        filters={clientProps.filters}
        initialCalendar={clientProps.initialCalendar}
        organizers={clientProps.organizers}
        todayDate={clientProps.todayDate}
      />
    </Suspense>
  );
}
