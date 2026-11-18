import { AnalyticsError, classifyGoogleFailure } from "./errors";

/**
 * The one HTTP path to Google's Analytics APIs: bearer header, timeout, bounded retry with
 * truncated exponential backoff (only 429, 500 and 503), a concurrency limit well below Google's
 * 10-request ceiling, and normalized errors. Never log what passes through here.
 */

export const MAX_CONCURRENT_REQUESTS = 5;
const TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 4_000;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  /** Called with Google's quota diagnostics when a response carries them. */
  onQuota?: (quota: unknown) => void;
};

/** A counting limiter that releases in order. */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return {
    get active() { return active; },
    get waiting() { return waiting.length; },
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
      active += 1;
      try {
        return await task();
      } finally {
        next();
      }
    }
  };
}

const limiter = createLimiter(MAX_CONCURRENT_REQUESTS);
export const requestLimiter = limiter;

export const retryDelay = (attempt: number, random = Math.random) => Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt) + Math.floor(random() * 250);
const retryable = (status: number) => status === 429 || status === 500 || status === 503;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The property resource for a numeric ID or an existing `properties/123`. */
export function propertyResource(value: string | number): string {
  const id = String(value).replace(/^properties\//, "");
  if (!/^\d{1,20}$/.test(id)) throw new AnalyticsError("bad-request", 0, "Invalid property");
  return `properties/${id}`;
}

export async function googleJson<T>(url: string, token: string, options: RequestOptions = {}): Promise<T> {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? wait;
  return limiter.run(async () => {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: options.method ?? "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
          cache: "no-store"
        });
      } catch {
        if (attempt + 1 < MAX_ATTEMPTS) { await sleep(retryDelay(attempt, options.random)); continue; }
        throw new AnalyticsError("unavailable");
      }
      const text = await response.text();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
      if (response.ok) {
        const quota = (payload as { propertyQuota?: unknown } | null)?.propertyQuota;
        if (quota) options.onQuota?.(quota);
        return payload as T;
      }
      if (retryable(response.status) && attempt + 1 < MAX_ATTEMPTS) {
        await sleep(retryDelay(attempt, options.random));
        continue;
      }
      throw classifyGoogleFailure(response.status, payload);
    }
  });
}
