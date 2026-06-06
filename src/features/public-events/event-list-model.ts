import { compareOccurrences } from "@/lib/format";
import type { EventListOccurrence } from "@/lib/types";

export type TimeEventGroup = {
  time: string | null;
  events: EventListOccurrence[];
};

export type DateEventGroup = {
  date: string;
  eventCount: number;
  timeGroups: TimeEventGroup[];
};

export function groupOccurrencesByDateAndTime(
  events: EventListOccurrence[],
) {
  const groupsByDate = [...events].sort(compareOccurrences).reduce(
    (groups, event) => {
      const dateGroups = groups[event.occurrenceDate] ?? [];
      const currentTimeGroup = dateGroups[dateGroups.length - 1];

      if (currentTimeGroup?.time === event.occurrenceStartTime) {
        currentTimeGroup.events.push(event);
      } else {
        dateGroups.push({
          time: event.occurrenceStartTime,
          events: [event],
        });
      }

      groups[event.occurrenceDate] = dateGroups;
      return groups;
    },
    {} as Record<string, TimeEventGroup[]>,
  );

  return Object.entries(groupsByDate).map(([date, timeGroups]) => ({
    date,
    eventCount: timeGroups.reduce(
      (count, group) => count + group.events.length,
      0,
    ),
    timeGroups,
  }));
}

export function mergeOccurrences(
  currentEvents: EventListOccurrence[],
  nextEvents: EventListOccurrence[],
) {
  const eventsByKey = new Map(
    currentEvents.map((event) => [getOccurrenceKey(event), event]),
  );

  nextEvents.forEach((event) => {
    eventsByKey.set(getOccurrenceKey(event), event);
  });

  return Array.from(eventsByKey.values()).sort(compareOccurrences);
}

function getOccurrenceKey(event: EventListOccurrence) {
  return [
    event.id,
    event.occurrenceDate,
    event.occurrenceStartTime ?? "undecided",
  ].join("::");
}
