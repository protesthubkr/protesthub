import { Suspense } from "react";
import { HomePageClient } from "@/components/home-page-client";
import { getPublicEventOccurrences } from "@/lib/events";

export default async function Home() {
  const events = await getPublicEventOccurrences();

  return (
    <Suspense fallback={<main className="app-shell">불러오는 중</main>}>
      <HomePageClient events={events} />
    </Suspense>
  );
}
