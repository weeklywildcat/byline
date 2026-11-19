/**
 * The report cache. Google stays the source of truth; Byline caches what it fetched so a screen,
 * a refresh and the Home card don't each spend Google's quota. The interface is small on purpose:
 * a shared (Redis) store can replace the in-process one without touching report logic.
 */
export interface AnalyticsCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): void;
  clear(): void;
}

export function createMemoryCache(options: { max?: number; now?: () => number } = {}): AnalyticsCache {
  const max = options.max ?? 300;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { value: unknown; expires: number }>();
  return {
    get<T>(key: string) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) { entries.delete(key); return undefined; }
      // Least recently used moves to the back.
      entries.delete(key);
      entries.set(key, entry);
      return entry.value as T;
    },
    set(key, value, ttlMs) {
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttlMs });
      while (entries.size > max) entries.delete(entries.keys().next().value as string);
    },
    delete: (key) => void entries.delete(key),
    clear: () => entries.clear()
  };
}

export const TTL = {
  realtime: 25_000,
  today: 3 * 60_000,
  includingToday: 12 * 60_000,
  closed: 60 * 60_000
} as const;

/** How long a report for this range may be reused: a range that can still change expires sooner. */
export function ttlFor(range: { start: string; end: string; includesToday: boolean }): number {
  if (!range.includesToday) return TTL.closed;
  return range.start === range.end ? TTL.today : TTL.includingToday;
}

let shared: AnalyticsCache = createMemoryCache();
export const analyticsCache = () => shared;
export function useAnalyticsCache(cache: AnalyticsCache) { shared = cache; }

/** In-flight requests for a key share one Google call. */
const flights = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, options: { refresh?: boolean; cache?: AnalyticsCache } = {}): Promise<{ value: T; cached: boolean; fetchedAt: string }> {
  const store = options.cache ?? shared;
  type Hit = { value: T; fetchedAt: string };
  if (!options.refresh) {
    const hit = store.get<Hit>(key);
    if (hit) return { ...hit, cached: true };
  }
  let flight = flights.get(key) as Promise<Hit> | undefined;
  if (!flight) {
    flight = load().then((value) => {
      const hit: Hit = { value, fetchedAt: new Date().toISOString() };
      store.set(key, hit, ttlMs);
      return hit;
    }).finally(() => flights.delete(key));
    flights.set(key, flight);
  }
  return { ...(await flight), cached: false };
}
