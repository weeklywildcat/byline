// @vitest-environment jsdom
import type { ArtDirectionEditResult } from "@byline/newsroom-screens/media/art-direction-model";
import { MediaInspectorContent } from "@byline/newsroom-screens/media/MediaInspectorContent";
import type { MediaLibraryFetchers } from "@byline/newsroom-screens/media/media-library-api";
import type { MediaAssetDetail, MediaPublicationDetail } from "@byline/newsroom-screens/media/media-library-model";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Media inspector with the art-direction editor: opening crops with
 * unsaved file details never loses them, and the reader's own crop save is
 * never a false conflict for those details, while someone else's change still
 * is. Also: publication state, Retry, and refreshing while preparing.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T0 = "2026-11-01T12:00:00.000Z";
const T1 = "2026-11-01T12:05:00.000Z";
const T2 = "2026-11-01T12:09:00.000Z";
const publication = (overrides: Partial<MediaPublicationDetail> = {}): MediaPublicationDetail => ({ state: "ready", reason: "ready", currentRevision: 1, preparedRevision: 1, preparedAt: T0, failureMessage: null, warnings: [], canRetry: false, ...overrides });
const state = vi.hoisted(() => ({ updatedAt: "", filename: "band.jpg", publication: null as unknown, saves: [] as Array<Record<string, unknown>>, renames: [] as Array<Record<string, unknown>>, retries: 0, reads: 0 }));
const asset = (): MediaAssetDetail => ({
  id: 7, filename: state.filename, mimeType: "image/jpeg", kind: "image", filesize: 1000, width: 3000, height: 2000, previewUrl: "/p.webp", url: "/o.jpg",
  alt: "Band", creator: "Pat", credit: "Pat", copyright: "©", license: "", sourceUrl: "", tags: [], capturedAt: null, createdAt: T0, updatedAt: state.updatedAt,
  uploadedBy: null, folder: null, publicationAssets: (state.publication as MediaPublicationDetail).state, gaps: [], canUpdate: true, canDelete: false,
  folderPath: [], usages: [], usagesComplete: false, hiddenUsageCount: 0, publication: state.publication as MediaPublicationDetail
});
const fetchers = {
  getAsset: async () => { state.reads += 1; return asset(); },
  updateMedia: async (_id: number, patch: Record<string, unknown>) => {
    state.saves.push({ ...patch });
    if (patch.expectedUpdatedAt !== state.updatedAt) throw { message: "Someone else changed this file's details while you were editing.", data: { status: 409 } };
    state.updatedAt = T2;
    return { ...asset(), ...patch };
  },
  deleteMedia: async () => undefined,
  renameMedia: async (_id: number, input: { name: string; expectedUpdatedAt?: string }) => {
    state.renames.push({ ...input });
    if (input.expectedUpdatedAt !== state.updatedAt) throw { message: "Someone else changed this file while you were renaming it.", data: { status: 409 } };
    state.updatedAt = T1;
    state.filename = `${input.name}.jpg`;
    return asset();
  },
  retryPublication: async () => { state.retries += 1; state.publication = publication({ state: "preparing", reason: "preparing" }); return asset(); }
} as unknown as Pick<MediaLibraryFetchers, "getAsset" | "updateMedia" | "deleteMedia" | "retryPublication" | "renameMedia">;

let root: Root;
let container: HTMLElement;
let client: QueryClient;
beforeEach(() => {
  state.updatedAt = T0;
  state.publication = publication();
  state.saves.length = 0;
  state.renames.length = 0;
  state.filename = "band.jpg";
  state.retries = 0;
  state.reads = 0;
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.replaceChildren();
  vi.useRealTimers();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
async function mount(onEditArtDirection?: (id: number) => Promise<ArtDirectionEditResult | null>) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><AdminRoot toaster={false}><MediaInspectorContent fetchers={fetchers} assetId={7} timezone="America/Chicago" onEditArtDirection={onEditArtDirection} /></AdminRoot></QueryClientProvider>);
  });
  await flush();
}
async function typeAlt(value: string) {
  await act(async () => {
    const field = document.querySelector<HTMLTextAreaElement>("textarea[id^='media-alt-']")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = (selector: string) => act(async () => { document.querySelector<HTMLElement>(selector)!.click(); });
const save = () => act(async () => { document.querySelector<HTMLButtonElement>("[data-media-save-bar] button[type='submit']")!.click(); });
const altValue = () => document.querySelector<HTMLTextAreaElement>("textarea[id^='media-alt-']")!.value;

describe("art direction from the Media inspector", () => {
  it("keeps unsaved details and saves them after the reader's own crop save, without a false conflict", async () => {
    await mount(async () => {
      // The editor opened at T0 (the inspector's version) and its save made T1.
      state.updatedAt = T1;
      return { loadedUpdatedAt: T0, savedUpdatedAt: T1 };
    });
    await typeAlt("Band on the field");
    await click("[data-media-art-direction]");
    await flush();
    expect(altValue()).toBe("Band on the field");
    await save();
    await flush();
    expect(state.saves).toEqual([{ alt: "Band on the field", expectedUpdatedAt: T1 }]);
    expect(document.querySelector("[data-media-inspector] [role='alert']")).toBeNull();
  });

  it("still refuses details based on a version someone else changed before the crop editor opened", async () => {
    await mount(async () => {
      // Someone else saved details (T1) before this reader opened the editor; the crop save made T2.
      state.updatedAt = T2;
      return { loadedUpdatedAt: T1, savedUpdatedAt: T2 };
    });
    await typeAlt("My alt");
    await click("[data-media-art-direction]");
    await flush();
    await save();
    await flush();
    expect(state.saves).toEqual([{ alt: "My alt", expectedUpdatedAt: T0 }]);
    expect(document.body.textContent).toContain("Someone else changed");
    expect(altValue()).toBe("My alt");
  });

  it("shows publication state, offers Retry after a failure, and refreshes while preparing", async () => {
    state.publication = publication({ state: "failed", reason: "failed", failureMessage: "The original file is missing.", canRetry: true, preparedRevision: null });
    await mount();
    expect(document.querySelector("[data-media-publication]")?.getAttribute("data-media-publication")).toBe("failed");
    expect(document.body.textContent).toContain("The original file is missing.");
    await click("[data-media-retry]");
    await flush();
    expect(state.retries).toBe(1);
    expect(document.querySelector("[data-media-publication]")?.getAttribute("data-media-publication")).toBe("preparing");
    expect(document.querySelector("[data-media-retry]")).toBeNull();
    // The worker finishes; the preparing inspector re-reads on its own and turns Ready.
    state.publication = publication({ currentRevision: 1, preparedRevision: 1 });
    const before = state.reads;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 4300)); });
    expect(state.reads).toBeGreaterThan(before);
    expect(document.querySelector("[data-media-publication]")?.getAttribute("data-media-publication")).toBe("ready");
  }, 15_000);

  it("renames in place, keeps unsaved details and saves them afterwards without a false conflict", async () => {
    await mount();
    await typeAlt("Band on the field");
    await click("[data-media-rename-button]");
    const input = document.querySelector<HTMLInputElement>("[data-media-name-input]")!;
    expect(input.value).toBe("band");
    expect(document.querySelector("[data-media-rename]")?.textContent).toContain(".jpg");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Homecoming band");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { document.querySelector<HTMLFormElement>("[data-media-rename]")!.requestSubmit(); });
    await flush();
    expect(state.renames).toEqual([{ name: "Homecoming band", expectedUpdatedAt: T0 }]);
    expect(document.querySelector("[data-media-filename]")?.textContent).toBe("Homecoming band.jpg");
    expect(altValue()).toBe("Band on the field");
    await save();
    await flush();
    expect(state.saves.at(-1)).toMatchObject({ alt: "Band on the field", expectedUpdatedAt: T1 });
    expect(document.querySelector("[data-media-inspector] [role='alert']")).toBeNull();
  });
});
