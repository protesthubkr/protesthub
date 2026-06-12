import { notFound } from "next/navigation";
import {
  CanceledEventPage,
  EventDetailPage,
} from "@/features/public-events/event-detail-page";
import { getEventById } from "@/lib/events";

export const revalidate = 60;

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    notFound();
  }

  if (event.status === "canceled") {
    return <CanceledEventPage event={event} />;
  }

  return <EventDetailPage event={event} />;
}
