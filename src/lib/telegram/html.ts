import "server-only";

export const TELEGRAM_FETCH_USER_AGENT =
  "ProtestHubBot/1.0 (+https://protesthub.local)";

export async function fetchTelegramHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": TELEGRAM_FETCH_USER_AGENT,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Telegram page request failed: ${response.status}`);
  }

  return response.text();
}

export function getMetaContent(html: string, property: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapedProperty}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i",
  );

  return regex.exec(html)?.[1] ?? "";
}

export function normalizeText(value: string) {
  return decodeHtmlEntities(value).replace(/\r\n/g, "\n").trim();
}

export function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

export function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => namedEntities[name] ?? entity);
}
