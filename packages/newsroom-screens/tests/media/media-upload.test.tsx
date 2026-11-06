// @vitest-environment jsdom
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaUploadDialog } from "../../src/media/MediaUploadDialog";
import type { MediaLibraryFetchers } from "../../src/media/media-library-api";
import type { MediaLibraryAsset, MediaNavigatorData } from "../../src/media/media-library-model";

/** The one upload flow: several files at once, each reported on its own, retry for the ones that failed. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigator: MediaNavigatorData = {
  folders: [{ id: 7, name: "Band", parentId: null, assetCount: 0 }],
  counts: { all: 0, recent: 0, mine: 0, "needs-metadata": 0, unfiled: 0 },
  capabilities: { canUpload: true, canManageFolders: false, canDelete: false, acceptedMimeTypes: ["image/jpeg", "audio/mpeg"], maxUploadBytes: 1000 },
  uploaders: []
};

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.replaceChildren();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const statuses = () => [...document.querySelectorAll("[data-upload-status]")].map((item) => `${item.getAttribute("data-upload-status")}:${item.querySelector("[data-slot=item-title]")?.textContent}`);

describe("Upload media", () => {
  it("queues several files into the chosen folder, refuses wrong types and oversized files up front, and retries failures", async () => {
    let fail = true;
    const uploadMedia = vi.fn(async (file: File, options: { folderId: number | null; onProgress?: (fraction: number) => void }) => {
      options.onProgress?.(0.5);
      if (file.name === "flaky.jpg" && fail) {
        fail = false;
        throw { message: "The connection dropped.", data: { status: 0 } };
      }
      return { id: 1, filename: file.name } as MediaLibraryAsset;
    });
    const fetchers = { getNavigator: async () => navigator, uploadMedia } as unknown as Pick<MediaLibraryFetchers, "uploadMedia" | "getNavigator">;
    const client = new QueryClient();
    await act(async () => root.render(<AdminPortalContext value={document.body}><QueryClientProvider client={client}><MediaUploadDialog open onOpenChange={() => {}} fetchers={fetchers} folderId={7} /></QueryClientProvider></AdminPortalContext>));
    await flush();
    expect(document.body.textContent).toContain("New files go to Band.");
    const input = document.querySelector<HTMLInputElement>("[data-media-upload-input]")!;
    const files = [new File(["a"], "one.jpg", { type: "image/jpeg" }), new File(["b"], "flaky.jpg", { type: "image/jpeg" }), new File(["c"], "clip.mp4", { type: "video/mp4" }), new File([new Uint8Array(2000)], "huge.jpg", { type: "image/jpeg" })];
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    await flush();
    expect(statuses()).toEqual(["done:one.jpg", "failed:flaky.jpg", "failed:clip.mp4", "failed:huge.jpg"]);
    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(uploadMedia.mock.calls.every(([, options]) => options.folderId === 7)).toBe(true);
    expect(document.body.textContent).toContain("Media doesn't accept video/mp4");
    expect(document.body.textContent).toContain("2 KB is over the 1000 B upload limit");
    // Wrong types can't be retried; a dropped connection can.
    expect(document.querySelector("[aria-label='Retry clip.mp4']")).toBeNull();
    await act(async () => { document.querySelector<HTMLButtonElement>("[aria-label='Retry flaky.jpg']")!.click(); });
    await flush();
    await flush();
    expect(statuses()).toEqual(["done:one.jpg", "done:flaky.jpg", "failed:clip.mp4", "failed:huge.jpg"]);
    expect(document.body.textContent).toContain("2 uploaded · 2 failed");
  });
});
