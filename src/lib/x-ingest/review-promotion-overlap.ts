import type {
  CandidatePromotionRow,
  PublicEventOverlapRow,
} from "./review-promotion-types";

export function overlapsPublishedEvent(
  candidate: CandidatePromotionRow,
  events: PublicEventOverlapRow[],
) {
  const text = candidate.text_snapshot;
  const normalizedText = normalizeText(text);

  return events.some((event) => {
    if (candidate.source_url === event.source_post_url) {
      return true;
    }

    const eventText = [
      event.title,
      event.venue,
      event.address,
      event.region,
      event.source_account_name,
    ]
      .filter(Boolean)
      .join(" ");
    const textSimilarity = jaccardSimilarity(text, eventText);
    const hasEventDate = event.dates.some((date) =>
      getDateTextTokens(date.date).some((token) => text.includes(token)),
    );
    const hasEventPlace = [event.venue, event.address, event.region]
      .filter(Boolean)
      .some((value) => {
        const normalizedValue = normalizeText(value);
        const searchValue = normalizedValue.slice(
          0,
          Math.min(normalizedValue.length, 12),
        );

        return searchValue.length >= 2 && normalizedText.includes(searchValue);
      });

    return textSimilarity >= 0.32 || (hasEventDate && hasEventPlace);
  });
}

function getDateTextTokens(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return [];
  }

  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");

  return [
    `${month}.${day}`,
    `${paddedMonth}.${paddedDay}`,
    `${month}/${day}`,
    `${paddedMonth}/${paddedDay}`,
    `${month}월 ${day}일`,
    `${month}월${day}일`,
  ];
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = createTokenSet(left);
  const rightTokens = createTokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function createTokenSet(text: string) {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((token) => token.length >= 2),
  );
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
