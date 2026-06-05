import { notFound } from "next/navigation";
import {
  CanceledEventPage,
  EventDetailClient,
} from "@/components/event-detail-client";
import { getEventById } from "@/lib/events";

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

  return <EventDetailClient event={event} />;
}
