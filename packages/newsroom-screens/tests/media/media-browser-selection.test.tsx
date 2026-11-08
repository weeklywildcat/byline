// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaLibraryBrowser, type MediaLayout } from "../../src/media/MediaLibraryBrowser";
import { EMPTY_MEDIA_FILTERS, type MediaLibraryAsset, type MediaLibraryPage } from "../../src/media/media-library-model";

/**
 * Multi-select in the Media Library: checkboxes on every file, ⌘/Ctrl-click
 * toggles, Shift selects a range, a plain click toggles once something is
 * checked (and opens the details otherwise), ⌘A checks every loaded file and
 * Escape clears. The same in Grid and List.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asset = (id: number): MediaLibraryAsset => ({
  id, filename: `photo-${id}.jpg`, mimeType: "image/jpeg", kind: "image", filesize: 1000, width: 800, height: 600, previewUrl: null, url: `/o/${id}.jpg`,
  alt: "", creator: "", credit: "", copyright: "", license: "", sourceUrl: "", tags: [], capturedAt: null, createdAt: "2026-11-01T12:00:00.000Z", updatedAt: "2026-11-01T12:00:00.000Z",
  uploadedBy: null, folder: null, publicationAssets: "ready", gaps: [], canUpdate: true, canDelete: true
});
const page: MediaLibraryPage = { assets: [1, 2, 3, 4, 5].map(asset), totalDocs: 5, totalPages: 1, page: 1, hasNextPage: false } as MediaLibraryPage;
const fetchers = { getLibrary: async () => page };

let root: Root;
let container: HTMLElement;
let checked: Set<number>;
let opened: number[];
let looked: number[];
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  // jsdom has no PointerEvent; Base UI's checkbox forwards its click (with modifiers) as one.
  (window as { PointerEvent?: unknown }).PointerEvent ??= window.MouseEvent;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  checked = new Set();
  opened = [];
  looked = [];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Harness({ layout }: { layout: MediaLayout }) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  checked = ids;
  return (
    <MediaLibraryBrowser
      fetchers={fetchers}
      source="all"
      folderId={null}
      filters={EMPTY_MEDIA_FILTERS}
      onFiltersChange={() => {}}
      sort="newest"
      onSortChange={() => {}}
      layout={layout}
      onLayoutChange={() => {}}
      timezone="America/Chicago"
      onActivate={(item) => opened.push(item.id)}
      onQuickLook={(item) => looked.push(item.id)}
      checkedIds={ids}
      onCheckedChange={setIds}
      selectionBar={<div data-test-bar="">bar</div>}
    />
  );
}

async function mount(layout: MediaLayout = "grid") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><Harness layout={layout} /></QueryClientProvider>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

const tile = (id: number) => container.querySelector<HTMLElement>(`[data-media-asset="${id}"]`)!;
const box = (id: number) => container.querySelector<HTMLElement>(`[data-media-check="${id}"]`)!;
const click = (element: HTMLElement, init: MouseEventInit = {}) => act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init })); });
const keyOn = (element: HTMLElement, init: KeyboardEventInit) => act(async () => { element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });
const key = (init: KeyboardEventInit) => keyOn(tile(1), init);
const focused = () => Number((document.activeElement as HTMLElement | null)?.dataset.mediaAsset);
const ids = () => [...checked].sort((a, b) => a - b);

describe.each(["grid", "list"] as const)("multi-select in %s", (layout) => {
  it("opens the details on a plain click while nothing is checked", async () => {
    await mount(layout);
    await click(tile(2));
    expect(opened).toEqual([2]);
    expect(ids()).toEqual([]);
    expect(container.querySelector("[data-test-bar]")).toBeNull();
  });

  it("checks with a checkbox or ⌘-click, then toggles on plain clicks, and shows the bar", async () => {
    await mount(layout);
    await click(box(1));
    expect(ids()).toEqual([1]);
    await click(tile(3), { metaKey: true });
    expect(ids()).toEqual([1, 3]);
    await click(tile(1));
    expect(ids()).toEqual([3]);
    expect(opened).toEqual([]);
    expect(container.querySelector("[data-test-bar]")).not.toBeNull();
  });

  it("selects a range with Shift from the last file checked", async () => {
    await mount(layout);
    await click(box(2));
    await click(tile(5), { shiftKey: true });
    expect(ids()).toEqual([2, 3, 4, 5]);
  });

  it("checks every loaded file with ⌘A and clears with Escape", async () => {
    await mount(layout);
    await click(box(4));
    await key({ key: "a", metaKey: true });
    expect(ids()).toEqual([1, 2, 3, 4, 5]);
    await key({ key: "Escape" });
    expect(ids()).toEqual([]);
  });

  it("moves focus with the keyboard, opens Quick Look with Space and checks with X", async () => {
    await mount(layout);
    tile(1).focus();
    await keyOn(tile(1), { key: layout === "grid" ? "ArrowRight" : "ArrowDown" });
    expect(focused()).toBe(2);
    await keyOn(tile(2), { key: "End" });
    expect(focused()).toBe(5);
    await keyOn(tile(5), { key: "Home" });
    expect(focused()).toBe(1);
    await keyOn(tile(1), { key: " " });
    expect(looked).toEqual([1]);
    expect(opened).toEqual([]);
    await keyOn(tile(1), { key: "x" });
    expect(ids()).toEqual([1]);
  });
});
