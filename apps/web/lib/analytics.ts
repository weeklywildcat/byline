import { GOOGLE_MEASUREMENT_ID, type BylinePublicationAnalytics, type BylinePublicationConfig } from "@byline/core";

/**
 * Public Google Analytics measurement (docs/google-analytics.md). Everything here comes from the
 * public snapshot's `publication.analytics` and the page being rendered: never the newsroom, a
 * credential, a logged-in user or unpublished content.
 *
 * Pure and DOM-free so the build and the tests share it. The browser side is `analytics-client.ts`.
 */

export type AnalyticsContent = { type: "story"; id: number; group: string };

/** What the page carries to the browser. Only present when Byline installs the tag. */
export type AnalyticsRuntimeConfig = { measurementId: string; consentMode: "always" | "ask"; content: AnalyticsContent | null };

/**
 * `null` (inject nothing at all) unless Byline installs the tag. In external mode the Measurement ID isn't even
 * in the page, so a tag manager or existing Google tag never doubles with Byline's.
 */
export function analyticsRuntimeConfig(publication: Pick<BylinePublicationConfig, "analytics">, content?: AnalyticsContent | null): AnalyticsRuntimeConfig | null {
  const analytics: BylinePublicationAnalytics | null = publication.analytics;
  if (!analytics || analytics.provider !== "google" || !analytics.installTag || !GOOGLE_MEASUREMENT_ID.test(analytics.measurementId)) return null;
  const story = content && content.type === "story" && Number.isSafeInteger(content.id) && content.id > 0 && /^[a-z0-9-]{1,80}$/.test(content.group) ? content : null;
  return { measurementId: analytics.measurementId, consentMode: analytics.consentMode === "always" ? "always" : "ask", content: story };
}

/** `content_id` / `content_type` / `content_group` are GA's built-in content dimensions: no custom dimensions to register. */
export function contentParams(content: AnalyticsContent | null): Record<string, string> {
  return content ? { content_id: `story:${content.id}`, content_type: content.type, content_group: content.group } : {};
}

export const READ_THRESHOLDS = [[0.25, "byline_read_25"], [0.5, "byline_read_50"], [0.75, "byline_read_75"], [1, "byline_read_100"]] as const;

/** Threshold events, each at most once however often progress is reported. */
export function createReadTracker(emit: (event: string) => boolean) {
  const sent = new Set<string>();
  return (progress: number) => {
    if (!Number.isFinite(progress)) return;
    for (const [threshold, event] of READ_THRESHOLDS) {
      // 100% is "reached the end" and tolerates the last pixels of rounding.
      const reached = threshold === 1 ? progress >= 0.995 : progress >= threshold;
      // An event that wasn't emitted (analytics not allowed yet) stays eligible.
      if (reached && !sent.has(event) && emit(event)) sent.add(event);
    }
  };
}

/* ---------------------------------------------------------------- consent */

export const CONSENT_KEY = "byline:analytics-consent:v1";
export type ConsentChoice = "granted" | "denied";
export type ConsentStorage = Pick<Storage, "getItem" | "setItem"> | null;

export function readConsent(storage: ConsentStorage): ConsentChoice | null {
  try {
    const value = JSON.parse(storage?.getItem(CONSENT_KEY) ?? "null") as { v?: unknown; choice?: unknown } | null;
    return value?.v === 1 && (value.choice === "granted" || value.choice === "denied") ? value.choice : null;
  } catch {
    return null;
  }
}

export function writeConsent(storage: ConsentStorage, choice: ConsentChoice, now: Date = new Date()): void {
  try {
    storage?.setItem(CONSENT_KEY, JSON.stringify({ v: 1, choice, at: now.toISOString() }));
  } catch {
    // Private windows can refuse storage: the choice then lasts for this page only.
  }
}

/** Google consent states. Advertising is always denied: Byline measures publication audience, not ad personalization. */
export const consentStates = (analytics: boolean) => ({
  analytics_storage: analytics ? "granted" : "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied"
}) as const;

export const GTAG_SRC = (measurementId: string) => `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
