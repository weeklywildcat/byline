import { normalizeSearch } from "@/lib/search";
import { getBylineRestUrl } from "@/lib/byline-rest";

const MAX_SEARCH_GAP_QUERY_LENGTH = 120;
const sensitiveQueryPattern = /(?:^|\s)[^\s@]+@[^\s@]+\.[^\s@]+(?:$|\s)/;
const reportedSearchGaps = new Set<string>();

export type SearchGapEvent = {
  query: string;
  day: string;
  resultCountBucket: "0";
};

export function normalizeSearchGapQuery(value: string) {
  return normalizeSearch(value).slice(0, MAX_SEARCH_GAP_QUERY_LENGTH);
}

export function isSensitiveSearchGapQuery(value: string) {
  return sensitiveQueryPattern.test(normalizeSearch(value));
}

export function createSearchGapEvent(value: string, now = new Date()): SearchGapEvent | null {
  const normalizedValue = normalizeSearch(value);

  if (!normalizedValue || isSensitiveSearchGapQuery(normalizedValue)) {
    return null;
  }

  const query = normalizedValue.slice(0, MAX_SEARCH_GAP_QUERY_LENGTH);

  return {
    query,
    day: now.toISOString().slice(0, 10),
    resultCountBucket: "0"
  };
}

function resolveSearchGapEndpoint(endpoint: string) {
  if (typeof window === "undefined" || !endpoint.trim()) {
    return null;
  }

  try {
    const url = new URL(endpoint, window.location.origin);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort reporting for an aggregate zero-result search.
 *
 * The CMS endpoint is the default; a deployment may override it with
 * NEXT_PUBLIC_SEARCH_GAP_ENDPOINT. Search remains fully functional when the
 * endpoint is unavailable or rejects the request.
 */
export function reportZeroResultSearch(
  value: string,
  options: {
    endpoint?: string;
    now?: Date;
  } = {}
) {
  const endpoint = resolveSearchGapEndpoint(options.endpoint ?? process.env.NEXT_PUBLIC_SEARCH_GAP_ENDPOINT ?? getBylineRestUrl("search-gaps"));
  const event = createSearchGapEvent(value, options.now);

  if (!endpoint || !event) {
    return false;
  }

  const dedupeKey = `${event.day}:${event.query}`;

  if (reportedSearchGaps.has(dedupeKey)) {
    return false;
  }

  reportedSearchGaps.add(dedupeKey);
  const body = JSON.stringify(event);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));

      if (accepted) {
        return true;
      }
    }

    if (typeof fetch === "function") {
      void fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body,
        credentials: "omit",
        keepalive: true
      }).catch(() => undefined);

      return true;
    }
  } catch {
    // Search-gap telemetry is optional and must never interrupt searching.
  }

  return false;
}

/** Only useful for isolated tests; production callers should never need it. */
export function resetSearchGapDedupeForTests() {
  reportedSearchGaps.clear();
}
