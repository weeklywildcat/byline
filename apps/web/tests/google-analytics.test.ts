import { describe, expect, it } from "vitest";
import { normalizePublicationConfig } from "@byline/core";
import { validatePublicBuildSnapshot, validatePublicBuildSnapshotV4 } from "@byline/content";
import { WEEKLY_WILDCAT_PUBLICATION } from "@byline/theme-weekly-wildcat/publication";
import legacyPublication from "./fixtures/weekly-wildcat-publication.json";
import { analyticsRuntimeConfig, consentStates, contentParams, CONSENT_KEY, createReadTracker, GTAG_SRC, readConsent, writeConsent } from "@/lib/analytics";
import { createMeasurement, type MeasurementDeps } from "@/lib/analytics-client";

/**
 * Google Analytics in the public build (docs/google-analytics.md): the publication contract and
 * snapshot upgrade path, what a page injects, and the browser's measurement and consent behavior.
 */
const ANALYTICS = { provider: "google", measurementId: "G-MAIN12345", installTag: true, consentMode: "ask" } as const;

describe("publication contract", () => {
  it("reads a version 1 publication as measuring nothing", () => {
    const config = normalizePublicationConfig(legacyPublication, WEEKLY_WILDCAT_PUBLICATION);
    expect(config.schemaVersion).toBe(2);
    expect(config.analytics).toBeNull();
    expect(WEEKLY_WILDCAT_PUBLICATION.analytics).toBeNull();
  });

  it("keeps public measurement only when Byline installs a real Google tag", () => {
    const read = (analytics: unknown) => normalizePublicationConfig({ ...legacyPublication, schemaVersion: 2, analytics }, WEEKLY_WILDCAT_PUBLICATION).analytics;
    expect(read(ANALYTICS)).toEqual(ANALYTICS);
    expect(read({ ...ANALYTICS, consentMode: "always" })).toEqual({ ...ANALYTICS, consentMode: "always" });
    expect(read({ ...ANALYTICS, consentMode: "whatever" })?.consentMode).toBe("ask");
    // Managed outside Byline: not even the Measurement ID is public.
    expect(read({ ...ANALYTICS, installTag: false })).toBeNull();
    expect(read({ ...ANALYTICS, measurementId: "UA-123" })).toBeNull();
    expect(read({ ...ANALYTICS, provider: "plausible" })).toBeNull();
    expect(read(undefined)).toBeNull();
    // Only the four public facts survive.
    expect(Object.keys(read({ ...ANALYTICS, propertyId: "10", refreshToken: "x" })!).sort()).toEqual(["consentMode", "installTag", "measurementId", "provider"]);
  });
});

function snapshot(version: 2 | 3 | 4, analytics: unknown = null) {
  const datasets = { stories: [], people: [], sections: [], topics: [], pages: [], corrections: [], collections: [], events: [], media: [], redirects: [] };
  const publication = version === 4 ? { ...legacyPublication, schemaVersion: 2, revision: 3, analytics } : { ...legacyPublication, revision: 3 };
  return { schemaVersion: version, revision: 3, generatedAt: "2026-11-10T12:00:00.000Z", publication, datasets, counts: Object.fromEntries(Object.keys(datasets).map((key) => [key, 0])), ...(version >= 3 ? { data: { projects: [], releases: [] } } : {}) };
}

describe("snapshot v4", () => {
  it("still reads v2 and v3 snapshots, upgrading them with analytics: null", () => {
    for (const version of [2, 3] as const) {
      const upgraded = validatePublicBuildSnapshot(snapshot(version));
      expect(upgraded.schemaVersion).toBe(4);
      expect(upgraded.publication.schemaVersion).toBe(2);
      expect(upgraded.publication.analytics).toBeNull();
      expect(upgraded.data).toEqual({ projects: [], releases: [] });
    }
  });

  it("carries measurement, and nothing else about the connection", () => {
    expect(validatePublicBuildSnapshot(snapshot(4, ANALYTICS)).publication.analytics).toEqual(ANALYTICS);
    expect(validatePublicBuildSnapshot(snapshot(4, null)).publication.analytics).toBeNull();
    for (const extra of [{ propertyId: "10" }, { accountResource: "accounts/1" }, { refreshToken: "x" }, { googleAccountEmail: "a@b.c" }, { grantedScopes: [] }, { lastErrorCode: "x" }]) {
      expect(() => validatePublicBuildSnapshotV4(snapshot(4, { ...ANALYTICS, ...extra }))).toThrow(/Invalid Byline build snapshot/);
    }
    // An external tag has no public form: installTag false is never serialized.
    expect(() => validatePublicBuildSnapshotV4(snapshot(4, { ...ANALYTICS, installTag: false }))).toThrow();
    expect(() => validatePublicBuildSnapshotV4(snapshot(4, { ...ANALYTICS, measurementId: "nope" }))).toThrow();
  });

  it("keeps the old versions strict: a v3 snapshot can't smuggle analytics", () => {
    const smuggled = { ...snapshot(3), publication: { ...legacyPublication, revision: 3, analytics: ANALYTICS } };
    expect(() => validatePublicBuildSnapshot(smuggled)).toThrow(/Invalid Byline build snapshot/);
    expect(() => validatePublicBuildSnapshot({ ...snapshot(4), schemaVersion: 5 })).toThrow(/unsupported schemaVersion/);
  });
});

describe("what a page injects", () => {
  const publication = (analytics: unknown) => ({ analytics } as never);
  it("injects nothing at all unless Byline installs the tag", () => {
    expect(analyticsRuntimeConfig(publication(null))).toBeNull();
    expect(analyticsRuntimeConfig(publication({ ...ANALYTICS, installTag: false }))).toBeNull();
    expect(analyticsRuntimeConfig(publication({ ...ANALYTICS, measurementId: "bad" }))).toBeNull();
  });

  it("carries the Measurement ID, consent behavior and, for a Story, only public facts", () => {
    expect(analyticsRuntimeConfig(publication(ANALYTICS))).toEqual({ measurementId: "G-MAIN12345", consentMode: "ask", content: null });
    expect(analyticsRuntimeConfig(publication({ ...ANALYTICS, consentMode: "always" }), { type: "story", id: 42, group: "news" })).toEqual({ measurementId: "G-MAIN12345", consentMode: "always", content: { type: "story", id: 42, group: "news" } });
    expect(analyticsRuntimeConfig(publication(ANALYTICS), { type: "story", id: -1, group: "news" })?.content).toBeNull();
    expect(analyticsRuntimeConfig(publication(ANALYTICS), { type: "story", id: 1, group: "News & <b>" })?.content).toBeNull();
    expect(contentParams({ type: "story", id: 42, group: "news" })).toEqual({ content_id: "story:42", content_type: "story", content_group: "news" });
    expect(contentParams(null)).toEqual({});
  });

  it("keeps every advertising consent state denied", () => {
    expect(consentStates(true)).toEqual({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(consentStates(false)).toEqual({ analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  });
});

describe("reading progress", () => {
  it("fires each threshold once, however often progress is reported", () => {
    const sent: string[] = [];
    const track = createReadTracker((event) => { sent.push(event); return true; });
    for (const progress of [0, 0.1, 0.26, 0.3, 0.26, 0.5, 0.5, 0.8, 0.8, 0.99, 1, 1, 0.2]) track(progress);
    expect(sent).toEqual(["byline_read_25", "byline_read_50", "byline_read_75", "byline_read_100"]);
  });

  it("doesn't use up a threshold that wasn't sent", () => {
    const sent: string[] = [];
    let allowed = false;
    const track = createReadTracker((event) => { if (allowed) sent.push(event); return allowed; });
    track(0.6);
    allowed = true;
    track(0.6);
    expect(sent).toEqual(["byline_read_25", "byline_read_50"]);
  });
});

describe("the reader's consent choice", () => {
  const memory = () => { const map = new Map<string, string>(); return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) }; };
  it("is versioned and ignores anything it doesn't recognise", () => {
    const storage = memory();
    expect(readConsent(storage)).toBeNull();
    writeConsent(storage, "granted", new Date("2026-11-18T12:00:00Z"));
    expect(JSON.parse(storage.map.get(CONSENT_KEY)!)).toEqual({ v: 1, choice: "granted", at: "2026-11-18T12:00:00.000Z" });
    expect(readConsent(storage)).toBe("granted");
    storage.map.set(CONSENT_KEY, JSON.stringify({ v: 2, choice: "granted" }));
    expect(readConsent(storage)).toBeNull();
    storage.map.set(CONSENT_KEY, "{not json");
    expect(readConsent(storage)).toBeNull();
    expect(readConsent(null)).toBeNull();
    expect(() => writeConsent({ getItem: () => null, setItem: () => { throw new Error("private window"); } }, "denied")).not.toThrow();
  });
});

function harness(consentMode: "always" | "ask", content: { type: "story"; id: number; group: string } | null = { type: "story", id: 42, group: "news" }) {
  const commands: unknown[][] = [];
  const scripts: string[] = [];
  const disabled: boolean[] = [];
  const storage = (() => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) }; })();
  const deps: MeasurementDeps = {
    config: { measurementId: "G-MAIN12345", consentMode, content },
    gtag: (...args) => void commands.push(args), storage,
    loadScript: (src) => void scripts.push(src), page: () => ({ title: "Budget passes | Weekly Wildcat", href: "https://weeklywildcat.com/2026/11/10/news/budget-passes/" }),
    setDisabled: (value) => void disabled.push(value)
  };
  const events = () => commands.filter((command) => command[0] === "event").map((command) => [command[1], command[2]] as const);
  return { measurement: createMeasurement(deps), commands, scripts, disabled, storage, events };
}

describe("measurement", () => {
  it("always: loads the tag once, configures it once and sends exactly one Story pageview", () => {
    const { measurement, commands, scripts, events } = harness("always");
    expect(measurement.start()).toBe("collecting");
    expect(commands[0]).toEqual(["consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    expect(scripts).toEqual([GTAG_SRC("G-MAIN12345")]);
    expect(commands.filter((command) => command[0] === "config")).toEqual([["config", "G-MAIN12345", { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false }]]);
    expect(events()).toEqual([["page_view", { page_title: "Budget passes | Weekly Wildcat", page_location: "https://weeklywildcat.com/2026/11/10/news/budget-passes/", content_id: "story:42", content_type: "story", content_group: "news" }]]);
    measurement.allow();
    measurement.allow();
    expect(events().filter(([name]) => name === "page_view")).toHaveLength(1);
    expect(scripts).toHaveLength(1);
  });

  it("a page that isn't a Story sends no content identity, and nothing private", () => {
    const { measurement, events } = harness("always", null);
    measurement.start();
    expect(events()[0]![1]).toEqual({ page_title: "Budget passes | Weekly Wildcat", page_location: "https://weeklywildcat.com/2026/11/10/news/budget-passes/" });
    measurement.share("copy_link");
    measurement.progress(1);
    expect(events()).toHaveLength(1);
  });

  it("ask: sends and loads nothing, with every consent state denied, until the reader allows", () => {
    const { measurement, commands, scripts, events } = harness("ask");
    expect(measurement.start()).toBe("waiting");
    expect(commands).toEqual([["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]]);
    expect(scripts).toEqual([]);
    expect(events()).toEqual([]);
    measurement.share("native");
    measurement.progress(0.9);
    expect(events()).toEqual([]);
    measurement.allow();
    expect(scripts).toEqual([GTAG_SRC("G-MAIN12345")]);
    expect(commands.find((command) => command[0] === "consent" && command[1] === "update")).toEqual(["consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    expect(events().filter(([name]) => name === "page_view")).toHaveLength(1);
    expect(measurement.consent).toBe("granted");
  });

  it("ask: remembers an earlier Allow, and a No thanks never loads Google", () => {
    const first = harness("ask");
    first.measurement.start();
    first.measurement.allow();
    const returning = harness("ask");
    returning.storage.setItem(CONSENT_KEY, first.storage.getItem(CONSENT_KEY)!);
    expect(returning.measurement.start()).toBe("collecting");
    expect(returning.scripts).toHaveLength(1);
    expect(returning.events().filter(([name]) => name === "page_view")).toHaveLength(1);

    const declined = harness("ask");
    declined.measurement.start();
    declined.measurement.deny();
    expect(declined.scripts).toEqual([]);
    expect(declined.events()).toEqual([]);
    expect(declined.measurement.consent).toBe("denied");
    const later = harness("ask");
    later.storage.setItem(CONSENT_KEY, declined.storage.getItem(CONSENT_KEY)!);
    expect(later.measurement.start()).toBe("waiting");
    expect(later.scripts).toEqual([]);
  });

  it("revoking stops collection on this page and on the next", () => {
    const { measurement, commands, events, disabled, storage } = harness("ask");
    measurement.start();
    measurement.allow();
    const before = events().length;
    measurement.deny();
    expect(disabled.at(-1)).toBe(true);
    expect(commands.at(-1)).toEqual(["consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    measurement.share("native");
    measurement.progress(1);
    expect(events()).toHaveLength(before);
    const next = harness("ask");
    next.storage.setItem(CONSENT_KEY, storage.getItem(CONSENT_KEY)!);
    expect(next.measurement.start()).toBe("waiting");
    expect(next.scripts).toEqual([]);
  });

  it("measures reading, sharing and sign-ups only when allowed, each threshold once, tagged with the Story", () => {
    const { measurement, events } = harness("always");
    measurement.start();
    for (const progress of [0.1, 0.3, 0.3, 0.6, 0.8, 1, 1]) measurement.progress(progress);
    measurement.share("copy_link");
    measurement.signUp("newsletter");
    const names = events().map(([name]) => name);
    expect(names).toEqual(["page_view", "byline_read_25", "byline_read_50", "byline_read_75", "byline_read_100", "share", "sign_up"]);
    expect(names).not.toContain("scroll");
    expect(events().find(([name]) => name === "byline_read_50")![1]).toMatchObject({ content_id: "story:42" });
    expect(events().find(([name]) => name === "share")![1]).toMatchObject({ method: "copy_link", content_type: "story", item_id: "story:42" });
    expect(events().find(([name]) => name === "sign_up")![1]).toMatchObject({ method: "newsletter" });
  });
});
