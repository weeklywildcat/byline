// @vitest-environment jsdom
import { MediaInspectorContent } from "@byline/newsroom-screens/media/MediaInspectorContent";
import type { MediaLibraryFetchers } from "@byline/newsroom-screens/media/media-library-api";
import { mediaRouteSearch, parseMediaRoute, type MediaAssetDetail } from "@byline/newsroom-screens/media/media-library-model";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushMediaEntry, replaceMediaEntry } from "../src/ui/media/media-history";
import { useMediaUnsaved } from "../src/ui/media/media-unsaved";

/**
 * Browser Back and Forward with unsaved file details, over jsdom's real
 * History API and the real inspector, history guard and Save / Discard / Stay
 * dialog. The harness stands in for Next: it follows the address on `popstate`
 * (in the bubble phase, after the guard's capture listener), so a traversal
 * the guard swallows never reaches it, exactly as in the app.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asset = (id: number): MediaAssetDetail => ({
  id, filename: `photo-${id}.jpg`, mimeType: "image/jpeg", kind: "image", filesize: 1000, width: 10, height: 10, previewUrl: null, url: null,
  alt: `Alt ${id}`, creator: "Pat", credit: "Pat / Wildcat", copyright: "© 2026", license: "All rights reserved", sourceUrl: "", capturedAt: null,
  createdAt: "2026-11-01T12:00:00.000Z", updatedAt: "2026-11-01T12:00:00.000Z", uploadedBy: null, folder: null, publicationAssets: "not-prepared", gaps: [],
  canUpdate: true, canDelete: false, folderPath: [], usages: [], usagesComplete: false, hiddenUsageCount: 0,
  publication: { state: "not-prepared", reason: "not-prepared", currentRevision: 1, preparedRevision: null, preparedAt: null, failureMessage: null, warnings: [], canRetry: false }
});

const env = vi.hoisted(() => ({ failSave: false, saves: [] as Array<{ id: number; patch: Record<string, unknown> }>, routes: [] as number[] }));
const fetchers: Pick<MediaLibraryFetchers, "getAsset" | "updateMedia" | "deleteMedia"> = {
  getAsset: async (id) => asset(id),
  updateMedia: async (id, patch) => {
    env.saves.push({ id, patch: { ...patch } });
    if (env.failSave) throw { message: "The details couldn't be saved." };
    return { ...asset(id), ...patch, updatedAt: "2026-11-02T12:00:00.000Z" } as MediaAssetDetail;
  },
  deleteMedia: async () => undefined
} as never;

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
const url = () => `${window.location.pathname}${window.location.search}`;

/** Media, as Byline wires it: the address is the route; moves within Media go through the guard and the marked history. */
function Harness({ onPopState }: { onPopState: () => void }) {
  const [search, setSearch] = useState(() => window.location.search);
  useEffect(() => {
    const follow = () => { onPopState(); setSearch(window.location.search); };
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, [onPopState]);
  const route = parseMediaRoute(search);
  const { guard, guarded, dialog } = useMediaUnsaved(search);
  const open = (assetId: number) => guarded(() => { pushMediaEntry(`/admin/media${mediaRouteSearch({ ...route, assetId })}`); setSearch(window.location.search); });
  return (
    <AdminRoot toaster={false}>
      <div data-route={search}>
        {[1, 2, 3].map((id) => <button key={id} data-open={id} onClick={() => open(id)}>Open {id}</button>)}
        <button data-replace="" onClick={() => { replaceMediaEntry("/admin/media?asset=9"); setSearch(window.location.search); }}>Replace</button>
        {route.assetId !== null ? <MediaInspectorContent key={route.assetId} fetchers={fetchers} assetId={route.assetId} timezone="America/Chicago" guardRef={guard} /> : null}
      </div>
      {dialog}
    </AdminRoot>
  );
}

let root: Root;
let container: HTMLElement;
let followed: number;
beforeEach(() => {
  env.failSave = false;
  env.saves.length = 0;
  followed = 0;
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  // The page before Media (Calendar), then Media reached the way another Byline page reaches it: an unmarked entry.
  window.history.replaceState(null, "", "/admin/calendar");
  window.history.pushState({ __NA: true }, "", "/admin/media?asset=1");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.replaceChildren();
});

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onPopState = () => { followed += 1; };
  const { QueryClientProvider: Provider } = { QueryClientProvider };
  await act(async () => { root.render(<Provider client={client}><Harness onPopState={onPopState} /></Provider>); });
  await flush();
}
const click = (selector: string) => act(async () => { container.querySelector<HTMLElement>(selector)!.click(); });
const altField = () => document.querySelector<HTMLTextAreaElement>("textarea[id^='media-alt-']")!;
const dialog = () => document.querySelector("[data-media-unsaved]");
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("[data-media-unsaved] button")].find((item) => item.textContent === label)!;
const shownAsset = () => document.querySelector("[data-media-inspector]")?.getAttribute("data-asset-id");
async function edit(value: string) {
  await act(async () => {
    const field = altField();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** asset 1 → asset 2 (two Media entries behind the Calendar one). */
async function openSecond() {
  await mount();
  await click("[data-open='2']");
  await flush();
  expect(url()).toBe("/admin/media?asset=2");
  expect(shownAsset()).toBe("2");
}
const back = async (steps = 1) => { await act(async () => { window.history.go(-steps); }); await flush(); };
const forward = async () => { await act(async () => { window.history.forward(); }); await flush(); };

describe("Media history entries", () => {
  it("marks the first entry (a deep link, another Byline page), counts up on push and keeps the marker on replace", async () => {
    await mount();
    const first = window.history.state.bylineMedia;
    expect(first.index).toBe(0);
    await click("[data-open='2']");
    expect(window.history.state.bylineMedia).toEqual({ lineage: first.lineage, index: 1 });
    await click("[data-replace]");
    expect(url()).toBe("/admin/media?asset=9");
    expect(window.history.state.bylineMedia).toEqual({ lineage: first.lineage, index: 1 });
  });

  it("keeps its lineage across a reload (the entries and their markers survive it)", async () => {
    await openSecond();
    const marker = window.history.state.bylineMedia;
    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    expect(window.history.state.bylineMedia).toEqual(marker);
  });
});

describe("Back and Forward with a clean inspector", () => {
  it("navigate at once, with no question", async () => {
    await openSecond();
    await back();
    expect(url()).toBe("/admin/media?asset=1");
    expect(shownAsset()).toBe("1");
    expect(dialog()).toBeNull();
    await forward();
    expect(url()).toBe("/admin/media?asset=2");
    expect(shownAsset()).toBe("2");
    expect(dialog()).toBeNull();
  });

  it("leave Media normally when the entry before it is another page", async () => {
    await mount();
    await back();
    expect(url()).toBe("/admin/calendar");
    expect(followed).toBe(1);
    expect(dialog()).toBeNull();
  });
});

describe("Back with unsaved file details", () => {
  it("stays on the file, keeps the edits, and asks (Next never sees the traversal)", async () => {
    await openSecond();
    await edit("A better alt text");
    await back();
    expect(url()).toBe("/admin/media?asset=2");
    expect(shownAsset()).toBe("2");
    expect(altField().value).toBe("A better alt text");
    expect(dialog()).not.toBeNull();
    expect(followed).toBe(0);
  });

  it("Stay: the address, the file and the edits are untouched", async () => {
    await openSecond();
    await edit("A better alt text");
    await back();
    await act(async () => { button("Stay").click(); });
    await flush();
    expect(dialog()).toBeNull();
    expect(url()).toBe("/admin/media?asset=2");
    expect(altField().value).toBe("A better alt text");
    expect(window.history.state.bylineMedia.index).toBe(1);
    // Still guarded afterwards.
    await back();
    expect(dialog()).not.toBeNull();
    expect(altField().value).toBe("A better alt text");
  });

  it("Discard: drops the edits and replays Back, once, without asking again", async () => {
    await openSecond();
    await edit("A better alt text");
    await back();
    await act(async () => { button("Discard").click(); });
    await flush();
    expect(url()).toBe("/admin/media?asset=1");
    expect(shownAsset()).toBe("1");
    expect(dialog()).toBeNull();
    // Only the replay reached Next; the reader's Back and the correction did not.
    expect(followed).toBe(1);
    expect(env.saves).toEqual([]);
    await forward();
    expect(shownAsset()).toBe("2");
    expect(altField().value).toBe("Alt 2");
  });

  it("Save changes: saves through the inspector's own save, then goes Back", async () => {
    await openSecond();
    await edit("A better alt text");
    await back();
    await act(async () => { button("Save changes").click(); });
    await flush();
    expect(env.saves).toEqual([{ id: 2, patch: expect.objectContaining({ alt: "A better alt text", expectedUpdatedAt: "2026-11-01T12:00:00.000Z" }) }]);
    expect(url()).toBe("/admin/media?asset=1");
    expect(shownAsset()).toBe("1");
    expect(dialog()).toBeNull();
    expect(followed).toBe(1);
  });

  it("a failed Save stays on the file with the edits", async () => {
    env.failSave = true;
    await openSecond();
    await edit("A better alt text");
    await back();
    await act(async () => { button("Save changes").click(); });
    await flush();
    expect(env.saves).toHaveLength(1);
    expect(url()).toBe("/admin/media?asset=2");
    expect(shownAsset()).toBe("2");
    expect(altField().value).toBe("A better alt text");
    expect(followed).toBe(0);
    expect(document.body.textContent).toContain("The details couldn't be saved.");
  });

  it("guards leaving Media entirely, from any depth (Discard goes to the page before)", async () => {
    await openSecond();
    await edit("A better alt text");
    await back(2);
    expect(url()).toBe("/admin/media?asset=2");
    expect(dialog()).not.toBeNull();
    expect(followed).toBe(0);
    await act(async () => { button("Discard").click(); });
    await flush();
    expect(url()).toBe("/admin/calendar");
    expect(followed).toBe(1);
  });

  it("guards leaving Media from the first Media entry, and Stay keeps it open", async () => {
    await mount();
    await edit("A better alt text");
    await back();
    expect(url()).toBe("/admin/media?asset=1");
    expect(dialog()).not.toBeNull();
    await act(async () => { button("Stay").click(); });
    await flush();
    expect(url()).toBe("/admin/media?asset=1");
    expect(altField().value).toBe("A better alt text");
  });

  it("still protects the edits after a reload", async () => {
    await openSecond();
    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    await edit("A better alt text");
    await back();
    expect(url()).toBe("/admin/media?asset=2");
    expect(dialog()).not.toBeNull();
    await act(async () => { button("Discard").click(); });
    await flush();
    expect(url()).toBe("/admin/media?asset=1");
  });
});

describe("Forward with unsaved file details", () => {
  it("is protected the same way", async () => {
    await openSecond();
    await back();
    expect(shownAsset()).toBe("1");
    await edit("A better alt text");
    await forward();
    expect(url()).toBe("/admin/media?asset=1");
    expect(altField().value).toBe("A better alt text");
    expect(dialog()).not.toBeNull();
    expect(followed).toBe(1); // only the earlier, clean Back
    await act(async () => { button("Discard").click(); });
    await flush();
    expect(url()).toBe("/admin/media?asset=2");
    expect(shownAsset()).toBe("2");
    expect(followed).toBe(2);
  });
});

describe("moving within Media by Byline", () => {
  it("still asks first (the one dialog), and navigates once answered", async () => {
    await openSecond();
    await edit("A better alt text");
    await click("[data-open='3']");
    expect(dialog()).not.toBeNull();
    expect(url()).toBe("/admin/media?asset=2");
    await act(async () => { button("Discard").click(); });
    await flush();
    expect(url()).toBe("/admin/media?asset=3");
    expect(window.history.state.bylineMedia.index).toBe(2);
  });
});

describe("leaving the page", () => {
  const unload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event;
  };

  it("has no unload protection while the details are clean", async () => {
    await openSecond();
    expect(unload().defaultPrevented).toBe(false);
  });

  it("asks the browser to confirm reload, close or another address only while the details are unsaved", async () => {
    await openSecond();
    await edit("A better alt text");
    const event = unload();
    expect(event.defaultPrevented).toBe(true);
    // Cancelling the edit removes the protection again.
    await act(async () => { [...container.querySelectorAll<HTMLButtonElement>("[data-media-save-bar] button")].find((item) => item.textContent === "Cancel")!.click(); });
    expect(unload().defaultPrevented).toBe(false);
  });
});
