import { Suspense } from "react";
import { HomePageClient } from "@/features/public-events/home-page-client";
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
  const { searchSignature, ...clientProps } =
    await getPublicEventsHomePageData(await searchParams);

  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <LoadingState />
        </main>
      }
    >
      <HomePageClient key={searchSignature} {...clientProps} />
    </Suspense>
  );
}
