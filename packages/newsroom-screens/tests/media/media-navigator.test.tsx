// @vitest-environment jsdom
import { SidebarProvider } from "@byline/newsroom-ui/ui/sidebar";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaNavigatorContent } from "../../src/media/MediaNavigatorContent";
import { DEFAULT_MEDIA_ROUTE, type MediaNavigatorData, type MediaRoute } from "../../src/media/media-library-model";

/**
 * The Media navigator: Library scopes and Work views as plain menu items,
 * and sidebar-11's tree over real folders only, where the row selects a
 * folder and the chevron alone expands it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data: MediaNavigatorData = {
  folders: [
    { id: 1, name: "Sports", parentId: null, assetCount: 0 },
    { id: 2, name: "Football", parentId: 1, assetCount: 3 },
    { id: 3, name: "Homecoming", parentId: 2, assetCount: 1 },
    { id: 4, name: "Arts", parentId: null, assetCount: 2 }
  ],
  counts: { all: 40, recent: 5, mine: 2, "needs-metadata": 7, unfiled: 3 },
  capabilities: { canUpload: true, canManageFolders: true, canDelete: true, acceptedMimeTypes: ["image/jpeg"], maxUploadBytes: 20 * 1024 * 1024 },
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
});

function Harness({ onNavigate, showUnassigned = false, initial = DEFAULT_MEDIA_ROUTE }: { onNavigate: (route: MediaRoute) => void; showUnassigned?: boolean; initial?: MediaRoute }) {
  const [route, setRoute] = useState(initial);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  return (
    <SidebarProvider>
      <MediaNavigatorContent
        data={data}
        route={route}
        hrefFor={(next) => `/admin/media?${next.folderId ?? next.source}`}
        onNavigate={(next) => { onNavigate(next); setRoute(next); }}
        workCounts={{ mine: 2, due: 1, "needs-files": 4, unassigned: 1 }}
        showUnassigned={showUnassigned}
        expanded={expanded}
        onExpandedChange={(id, open) => setExpanded((current) => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next; })}
        onNewFolder={() => {}}
      />
    </SidebarProvider>
  );
}

const tree = () => container.querySelector("[data-media-folder-tree]")!;
const folderLinks = () => [...tree().querySelectorAll("a")].map((link) => link.textContent);
const click = (element: Element | null | undefined) => act(() => { (element as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 })); });

describe("the Media navigator", () => {
  it("has Library, Work and Folders, and Library scopes are menu items, not folders", () => {
    act(() => root.render(<Harness onNavigate={() => {}} />));
    expect([...container.querySelectorAll("[data-slot=sidebar-group-label]")].map((label) => label.textContent)).toEqual(["Library", "Work", "Folders"]);
    const scopes = [...container.querySelectorAll("[data-media-source]")];
    expect(scopes.map((item) => item.textContent)).toEqual(["All media", "Recent", "Uploaded by me", "Needs metadata", "Unfiled"]);
    expect(scopes.every((item) => !tree().contains(item))).toBe(true);
    // Counts where they ask for attention: Needs metadata and Unfiled, not every total.
    expect(container.querySelector("[aria-label='7 files']")).not.toBeNull();
    expect(container.querySelector("[aria-label='40 files']")).toBeNull();
    expect(container.querySelector("[data-media-source=all]")?.getAttribute("aria-current")).toBe("page");
  });

  it("shows only top-level folders until one is expanded, and never files", () => {
    act(() => root.render(<Harness onNavigate={() => {}} />));
    expect(folderLinks()).toEqual(["Arts", "Sports"]);
    // Collapsed children are not in the document at all (nothing hidden to tab through).
    expect(tree().textContent).not.toContain("Football");
    const chevron = tree().querySelector("[aria-label='Expand Sports']");
    click(chevron);
    expect(folderLinks()).toEqual(["Arts", "Sports", "Football"]);
    expect(tree().querySelector("[aria-label='Collapse Sports']")?.getAttribute("aria-expanded")).toBe("true");
    click(tree().querySelector("[aria-label='Collapse Sports']"));
    expect(folderLinks()).toEqual(["Arts", "Sports"]);
  });

  it("selects a folder with its row (expanding it), separately from the chevron", () => {
    const onNavigate = vi.fn();
    act(() => root.render(<Harness onNavigate={onNavigate} />));
    click(tree().querySelector("[aria-label='Expand Sports']"));
    expect(onNavigate).not.toHaveBeenCalled();
    const football = [...tree().querySelectorAll("a")].find((link) => link.textContent === "Football")!;
    click(football);
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ view: "library", folderId: 2, assetId: null }));
    expect(folderLinks()).toEqual(["Arts", "Sports", "Football", "Homecoming"]);
    const current = [...tree().querySelectorAll("a[aria-current=page]")].map((link) => link.textContent);
    expect(current).toEqual(["Football"]);
    // A folder is a real link (copy, new tab).
    expect(football.getAttribute("href")).toBe("/admin/media?2");
  });

  it("offers Work views as query presets, with Unassigned only for editors", () => {
    const onNavigate = vi.fn();
    act(() => root.render(<Harness onNavigate={onNavigate} />));
    expect([...container.querySelectorAll("[data-media-work]")].map((item) => item.textContent)).toEqual(["My assignments", "All assignments", "Due soon", "Needs files"]);
    click(container.querySelector("[data-media-work=due]"));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ view: "work", scope: "due" }));
    act(() => root.render(<Harness onNavigate={() => {}} showUnassigned />));
    expect(container.querySelector("[data-media-work=unassigned]")).not.toBeNull();
  });
});
