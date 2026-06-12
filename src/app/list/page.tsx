import { Suspense } from "react";
import { ListPageClient } from "@/features/public-events/list-page-client";
import {
  getPublicEventsHomePageData,
  type HomeSearchParams,
} from "@/features/public-events/home-page-data";
import { LoadingState } from "@/features/public-events/loading-state";

export const revalidate = 60;

type ListSearchParamsPromise = Promise<HomeSearchParams>;

export default async function ListPage({
  searchParams,
}: {
  searchParams: ListSearchParamsPromise;
}) {
  const clientProps = await getPublicEventsHomePageData(
    await searchParams,
    "list",
  );

  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <LoadingState />
        </main>
      }
    >
      <ListPageClient
        calendarMonth={clientProps.calendarMonth}
        filters={clientProps.filters}
        initialWindow={clientProps.initialWindow}
        listStartDate={clientProps.listStartDate}
        organizers={clientProps.organizers}
        todayDate={clientProps.todayDate}
      />
    </Suspense>
  );
}
