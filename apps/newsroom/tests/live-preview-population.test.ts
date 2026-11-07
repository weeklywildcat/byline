import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STORY_LIVE_PREVIEW_DEPTH, STORY_PREVIEW_BREAKPOINTS, STORY_PREVIEW_PATH, storyLivePreview } from "../src/preview/config";
import { POPULATION_FAILED, createStoryPopulation, storyIdFrom } from "../src/preview/population";

const message = (id: unknown, extra: Record<string, unknown> = {}) => ({ apiPath: "/api", serverURL: "http://localhost:3010", endpoint: "stories/undefined", data: { data: { id, headline: "H", ...extra }, depth: 2, flattenLocales: false, locale: "en" } });
const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("Story Live Preview configuration", () => {
  it("is a static same-origin URL with the three named breakpoints and a closed default", () => {
    expect(storyLivePreview.url).toBe("/preview/story");
    expect(storyLivePreview.url).toBe(STORY_PREVIEW_PATH);
    expect(typeof storyLivePreview.url).toBe("string");
    expect(storyLivePreview.openByDefault).toBe(false);
    expect(STORY_PREVIEW_BREAKPOINTS.map(({ label, width, height }) => [label, width, height])).toEqual([["Phone", 390, 844], ["Tablet", 820, 1180], ["Desktop", 1440, 900]]);
    expect(STORY_LIVE_PREVIEW_DEPTH).toBeGreaterThanOrEqual(2);
  });
});

describe("the static-route population bridge", () => {
  it("targets the Story ID carried by Payload's own form-state message and keeps Payload's request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const population = createStoryPopulation({ fetcher: (url, init) => { calls.push({ url, init }); return ok({ id: 7, headline: "Populated" }); } });
    const response = await population.requestHandler(message(7));
    expect(await response.json()).toEqual({ id: 7, headline: "Populated" });
    expect(calls[0].url).toBe("http://localhost:3010/api/stories/7");
    expect(calls[0].init).toMatchObject({ method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Payload-HTTP-Method-Override": "GET" } });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ data: { id: 7, headline: "H" }, depth: 2, flattenLocales: false, locale: "en" });
    expect(population.getStatus().state).toBe("live");
  });

  it("never invents an ID: an unsaved story is not requested", async () => {
    const calls: string[] = [];
    const population = createStoryPopulation({ fetcher: (url) => { calls.push(url); return ok({}); } });
    for (const id of [undefined, null, "", "abc", 0, -3, 1.5]) expect(storyIdFrom({ data: { id } })).toBeNull();
    expect(storyIdFrom({ data: { id: "12" } })).toBe(12);
    const body = await (await population.requestHandler(message(undefined))).json();
    expect(body).toEqual({ [POPULATION_FAILED]: "unsaved" });
    expect(calls).toEqual([]);
  });

  it("answers a failed request with the last good Story and reports why, instead of a blank article", async () => {
    let fail = false;
    const population = createStoryPopulation({ fetcher: () => (fail ? Promise.resolve(new Response(JSON.stringify({ errors: [{ message: "Nope" }] }), { status: 403 })) : ok({ id: 1, headline: "Good" })) });
    await population.requestHandler(message(1));
    fail = true;
    expect(await (await population.requestHandler(message(1))).json()).toEqual({ id: 1, headline: "Good" });
    expect(population.getStatus()).toMatchObject({ state: "failed", reason: "forbidden", status: 403, message: "Nope", hasResult: true });
  });

  it("reports session, missing story and network failures when there is nothing to fall back to", async () => {
    const status = (code: number) => createStoryPopulation({ fetcher: () => Promise.resolve(new Response("{}", { status: code })) });
    for (const [code, reason] of [[401, "signed-out"], [404, "not-found"], [500, "server"]] as const) {
      const population = status(code);
      expect(await (await population.requestHandler(message(2))).json()).toEqual({ [POPULATION_FAILED]: reason });
    }
    const offline = createStoryPopulation({ fetcher: () => Promise.reject(new Error("offline")) });
    expect(await (await offline.requestHandler(message(2))).json()).toEqual({ [POPULATION_FAILED]: "network" });
  });

  it("never steps back to an older response that returns after a newer one", async () => {
    const releases: Array<() => void> = [];
    const population = createStoryPopulation({
      fetcher: (_url, init) => {
        const body = JSON.parse(String(init.body)).data.headline as string;
        return new Promise<Response>((resolve) => releases.push(() => resolve(new Response(JSON.stringify({ id: 1, headline: body }), { status: 200 }))));
      }
    });
    const first = population.requestHandler(message(1, { headline: "old" }));
    const second = population.requestHandler(message(1, { headline: "new" }));
    releases[1]();
    expect(await (await second).json()).toEqual({ id: 1, headline: "new" });
    releases[0]();
    expect(await (await first).json()).toEqual({ id: 1, headline: "new" });
  });
});

describe("regression: Preview stays on through continuous editing and overlapping autosaves", () => {
  const source = readFileSync(new URL("../src/preview/StoryPreview.tsx", import.meta.url), "utf8");
  const stories = readFileSync(new URL("../src/collections/Stories.ts", import.meta.url), "utf8");
  const header = readFileSync(new URL("../src/ui/story/StoryPreviewControl.tsx", import.meta.url), "utf8");

  it("gives useLivePreview referentially stable inputs (it resubscribes and resets when they change)", () => {
    expect(source).toContain("const NO_INITIAL_DATA: StoryDoc = Object.freeze({})");
    expect(source).toMatch(/initialData: NO_INITIAL_DATA/);
    expect(source).toMatch(/requestHandler: population\.requestHandler/);
    expect(source).toContain("useState(createStoryPopulation)");
    expect(source).not.toMatch(/initialData: \{\s*\}/);
    expect(source).not.toMatch(/requestHandler: (async )?\(/);
  });

  it("uses Payload's transport only: no custom message listener and no second iframe", () => {
    expect(source).not.toMatch(/addEventListener\(["']message["']/);
    expect(source + header).not.toMatch(/<iframe/);
    expect(header).toContain("useLivePreviewContext");
    expect(header).toContain("setIsLivePreviewing");
  });

  it("keeps the static URL (a function URL is the codepath that closes Preview during overlapping autosaves)", () => {
    expect(stories).toContain("livePreview: storyLivePreview");
    expect(stories).toContain("autosave: { interval: 1200 }");
  });
});
