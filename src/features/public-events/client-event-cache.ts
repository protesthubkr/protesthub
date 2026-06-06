import type { EventCalendarMonth, EventOccurrenceWindow } from "@/lib/types";

const CLIENT_EVENT_CACHE_TTL_MS = 5 * 60 * 1000;
const CLIENT_EVENT_CACHE_MAX_ENTRIES = 80;

type ClientCacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const jsonCache = new Map<string, ClientCacheEntry<unknown>>();

export function fetchEventOccurrenceWindow(params: URLSearchParams) {
  return fetchCachedJson<EventOccurrenceWindow>("/api/events", params);
}

export function fetchEventCalendarMonth(params: URLSearchParams) {
  return fetchCachedJson<EventCalendarMonth>("/api/events/calendar", params);
}

function fetchCachedJson<T>(path: string, params: URLSearchParams) {
  const url = buildApiUrl(path, params);
  const now = Date.now();
  const cached = jsonCache.get(url);

  if (cached && cached.expiresAt > now) {
    return cached.promise as Promise<T>;
  }

  if (cached) {
    jsonCache.delete(url);
  }

  const promise = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}.`);
    }

    return (await response.json()) as T;
  });

  jsonCache.set(url, {
    expiresAt: now + CLIENT_EVENT_CACHE_TTL_MS,
    promise,
  });
  pruneClientCache();

  promise.catch(() => {
    const current = jsonCache.get(url);

    if (current?.promise === promise) {
      jsonCache.delete(url);
    }
  });

  return promise;
}

function buildApiUrl(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function pruneClientCache() {
  while (jsonCache.size > CLIENT_EVENT_CACHE_MAX_ENTRIES) {
    const oldestKey = jsonCache.keys().next().value;

    if (!oldestKey) {
      return;
    }

    jsonCache.delete(oldestKey);
  }
}
