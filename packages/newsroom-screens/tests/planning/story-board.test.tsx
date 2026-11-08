// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortalContext } from "@byline/newsroom-ui/lib/portal";
import { StoryBoard, type StoryBoardProps } from "../../src/planning/StoryBoard";
import { DEFAULT_WORKFLOW_STATUSES, type PlanningStory } from "../../src/planning/planning-model";
import { BOARD_COLLAPSED_PREFERENCE_KEY, type BoardLayout } from "../../src/planning/stories-board-layout";

/**
 * The board in each layout, mounted in a DOM: every story renders, empty
 * stages fold but still take drops, a reader's fold persists, and the
 * hover/focus menu still offers Move to.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stage = (id: string) => DEFAULT_WORKFLOW_STATUSES.find((status) => status.id === id)!;
const story = (id: number, workflow: string, patch: Partial<PlanningStory> = {}): PlanningStory => ({
  id, title: `Story ${id}`, editUrl: `/edit/${id}`, authors: [], writer: null, editor: null, workflow: stage(workflow),
  publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: null, plannedPublication: null, modifiedAt: null,
  visual: { type: "none", status: "needed" }, openTaskCount: 0, featuredImage: null, ...patch
});
const stories = [
  story(1, "pitch", { title: "Canteen could return", deadline: "2026-10-21", openTaskCount: 2, visual: { type: "photo", status: "assigned" }, authors: [{ id: 1, name: "Caroline Elrod" }] }),
  story(2, "reporting", { title: "Homecoming" }),
  story(3, "writing", { title: "Robotics", deadline: "2026-10-03" }),
  story(4, "on-hold", { title: "Paused" }),
  story(5, "dropped", { title: "Spiked" })
];

let host: HTMLDivElement;
let root: Root | null = null;
let onMoveStory: ReturnType<typeof vi.fn>;
const $ = <T extends Element = HTMLElement>(selector: string) => host.ownerDocument.querySelector<T & HTMLElement>(selector);
const $$ = (selector: string) => Array.from(host.ownerDocument.querySelectorAll<HTMLElement>(selector));

async function mount(layout: BoardLayout, patch: Partial<StoryBoardProps> = {}) {
  const props: StoryBoardProps = {
    layout, stories, statuses: DEFAULT_WORKFLOW_STATUSES, canMoveStories: true, movingStoryId: null, timezone: "America/New_York",
    now: new Date("2026-10-20T12:00:00Z"), workspaceUrl: (id) => `/stories/${id}`, onMoveStory, onOpenStory: vi.fn(), ...patch
  };
  root = createRoot(host);
  await act(async () => { root!.render(<AdminPortalContext value={document.body}><StoryBoard {...props} /></AdminPortalContext>); });
}
/** Let Base UI's menus and popovers finish opening. */
async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function click(element: HTMLElement | null) {
  expect(element).not.toBeNull();
  await act(async () => { element!.click(); });
  await settle();
}

beforeEach(() => {
  (window as { PointerEvent?: unknown }).PointerEvent ??= window.MouseEvent;
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  window.localStorage.clear();
  onMoveStory = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  host.remove();
  document.body.innerHTML = "";
});

const visibleStoryIds = () => $$("[data-story-id]").map((element) => Number(element.dataset.storyId)).sort();

describe("Lanes (the default)", () => {
  it("renders every story with a stage, and divides sidelined stages from the main ones", async () => {
    await mount("lanes", { layout: undefined });
    expect($("[data-board-layout]")?.dataset.boardLayout).toBe("lanes");
    // Dropped starts folded, so its story is counted on the rail but not drawn.
    expect(visibleStoryIds()).toEqual([1, 2, 3, 4]);
    expect($("[data-status='dropped']")?.getAttribute("aria-label")).toBe("Dropped, 1 story. Expand");
    expect($("[data-board-divider]")).not.toBeNull();
    const order = $$("[data-status]").map((element) => element.dataset.status);
    expect(order).toEqual(["pitch", "assigned", "reporting", "writing", "editing", "ready", "on-hold", "dropped"]);
  });

  it("folds an empty stage into a rail that is still a drop target", async () => {
    await mount("lanes");
    const rail = $("[data-status='assigned']")!;
    expect(rail.tagName).toBe("BUTTON");
    expect(rail.getAttribute("aria-expanded")).toBe("false");
    expect(rail.getAttribute("aria-label")).toBe("Assigned, 0 stories. Expand");
    expect(rail.dataset.over).toBe("false");
  });

  it("remembers a reader's fold and unfold", async () => {
    await mount("lanes");
    await click($("[aria-label='Collapse Reporting']"));
    expect($("[data-status='reporting']")?.dataset.collapsed).toBe("true");
    await click($("[data-status='assigned']"));
    expect($("[data-status='assigned']")?.dataset.collapsed).toBe("false");
    expect(JSON.parse(window.localStorage.getItem(BOARD_COLLAPSED_PREFERENCE_KEY) || "{}")).toEqual({ reporting: true, assigned: false });

    await act(async () => { root?.unmount(); });
    await mount("lanes");
    expect($("[data-status='reporting']")?.dataset.collapsed).toBe("true");
    expect($("[data-status='assigned']")?.textContent).toContain("No stories");
  });

  it("puts who and when on one row, without the old Due prefix or a visible menu row", async () => {
    await mount("lanes");
    const card = $("[data-story-id='1']")!;
    expect(card.textContent).toContain("Caroline Elrod");
    expect(card.textContent).toContain("Tomorrow");
    expect(card.textContent).toContain("2 tasks");
    expect($("[data-story-id='3']")!.textContent).toContain("17d overdue");
    expect($("[data-story-id='3'] time")!.className).toContain("text-warning");
    expect(card.textContent).not.toContain("Due ");
    const trigger = $("[data-story-actions='1']")!;
    expect(trigger.className).toContain("opacity-0");
    expect(trigger.className).toContain("group-focus-within/card:opacity-100");
    expect(trigger.className).toContain("pointer-coarse:opacity-100");
  });

  it("moves a story from the hover menu through the one move path", async () => {
    await mount("lanes");
    await click($("[data-story-actions='2']"));
    await click($$("[role=menuitem]").find((item) => item.textContent?.includes("Move to")) ?? null);
    const editing = $$("[role=menuitemradio]").find((item) => item.textContent === "Editing");
    expect(editing).toBeDefined();
    await click(editing!);
    expect(onMoveStory).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), "editing");
  });

  it("keeps the read-only notice for accounts that cannot move stories, with no draggable cards", async () => {
    await mount("lanes", { canMoveStories: false });
    expect(host.textContent).toContain("your account cannot move stories");
    expect($$("[data-story-id]").some((element) => element.getAttribute("draggable") === "true")).toBe(false);
  });
});

describe("Dense", () => {
  it("renders rows, not cards, with sidelined stages as chips below the board", async () => {
    await mount("dense");
    expect(visibleStoryIds()).toEqual([1, 2, 3]);
    expect($("[data-story-id='1']")?.getAttribute("data-slot")).not.toBe("card");
    const footer = $("[data-board-sidelined]")!;
    expect(footer.textContent).toContain("Sidelined");
    expect(footer.querySelector("[data-status='on-hold']")?.getAttribute("aria-label")).toBe("On Hold, 1 story");
    expect(footer.querySelector("[data-status='dropped']")).not.toBeNull();
    expect($$("[data-board-scroller] [data-status]").map((element) => element.dataset.status)).toEqual(["pitch", "assigned", "reporting", "writing", "editing", "ready"]);
  });

  it("draws an empty stage as a narrow drop slot that is still a drop target", async () => {
    await mount("dense");
    const slot = $("[data-status='assigned']")!;
    expect(slot.dataset.collapsed).toBe("true");
    expect(slot.className).toContain("w-37");
    expect(slot.textContent).toContain("Drop here");
  });

  it("shares the folded state with Lanes", async () => {
    await mount("dense");
    await click($("[aria-label='Collapse Writing']"));
    expect($("[data-status='writing']")?.textContent).toContain("Drop here");
    expect(JSON.parse(window.localStorage.getItem(BOARD_COLLAPSED_PREFERENCE_KEY) || "{}")).toEqual({ writing: true });
    await click($("[aria-label='Expand Writing']"));
    expect($("[data-story-id='3']")).not.toBeNull();
  });

  it("opens a sidelined stage's stories in a popover", async () => {
    await mount("dense");
    await click($("[data-board-sidelined] [data-status='on-hold']"));
    expect($("[data-story-id='4']")?.textContent).toContain("Paused");
  });

  it("moves a story from the hover menu", async () => {
    await mount("dense");
    await click($("[data-story-actions='3']"));
    await click($$("[role=menuitem]").find((item) => item.textContent?.includes("Move to")) ?? null);
    await click($$("[role=menuitemradio]").find((item) => item.textContent === "Ready for Review")!);
    expect(onMoveStory).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), "ready");
  });
});

describe("Stacked", () => {
  it("renders a section per stage, sidelined included, with every story and no fitted height", async () => {
    await mount("stacked");
    expect(visibleStoryIds()).toEqual([1, 2, 3, 4, 5]);
    expect($$("section[data-status]").map((element) => element.dataset.status)).toEqual(["pitch", "assigned", "reporting", "writing", "editing", "ready", "on-hold", "dropped"]);
    expect($("[data-board-frame]")).toBeNull();
    expect($("[data-status='assigned']")?.textContent).toContain("· No stories");
  });

  it("keeps an empty section as a drop target", async () => {
    await mount("stacked");
    expect($("[data-status='assigned']")?.dataset.empty).toBe("true");
    expect($("[data-status='assigned']")?.dataset.over).toBe("false");
  });

  it("moves a story from the hover menu", async () => {
    await mount("stacked");
    await click($("[data-story-actions='1']"));
    await click($$("[role=menuitem]").find((item) => item.textContent?.includes("Move to")) ?? null);
    await click($$("[role=menuitemradio]").find((item) => item.textContent === "Assigned")!);
    expect(onMoveStory).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "assigned");
  });
});

describe("moving into a folded stage", () => {
  /** A host that applies the move, as useMoveStory does, so the board re-renders with the story in its new stage. */
  async function mountApplying(layout: BoardLayout) {
    let current = stories;
    const render = (handler: StoryBoardProps["onMoveStory"]) => root!.render(<AdminPortalContext value={document.body}><StoryBoard layout={layout} stories={current} statuses={DEFAULT_WORKFLOW_STATUSES} canMoveStories movingStoryId={null}
      timezone="America/New_York" now={new Date("2026-10-20T12:00:00Z")} workspaceUrl={(id) => `/stories/${id}`} onOpenStory={vi.fn()} onMoveStory={handler} /></AdminPortalContext>);
    const apply = vi.fn(async (moved: PlanningStory, status: string) => {
      current = current.map((item) => item.id === moved.id ? { ...item, workflow: stage(status) } : item);
      render(apply);
    });
    onMoveStory = apply;
    root = createRoot(host);
    await act(async () => { render(apply); });
  }
  async function moveFromMenu(storyId: number, label: string) {
    await click($(`[data-story-actions='${storyId}']`));
    await click($$("[role=menuitem]").find((item) => item.textContent?.includes("Move to")) ?? null);
    await click($$("[role=menuitemradio]").find((item) => item.textContent === label) ?? null);
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))); });
  }

  it("keeps Lanes' fold, flashes the rail and gives it focus", async () => {
    await mountApplying("lanes");
    await moveFromMenu(2, "Dropped");
    expect(onMoveStory).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), "dropped");
    const rail = $("[data-status='dropped']")!;
    expect(rail.dataset.collapsed).toBe("true");
    expect(rail.getAttribute("aria-label")).toBe("Dropped, 2 stories. Expand");
    expect(rail.dataset.moved).toBe("true");
    expect(document.activeElement).toBe(rail);
  });

  it("focuses a Dense sidelined chip when its popover is closed", async () => {
    await mountApplying("dense");
    await moveFromMenu(3, "On Hold");
    const chip = $("[data-board-sidelined] [data-status='on-hold']")!;
    expect(chip.getAttribute("aria-label")).toBe("On Hold, 2 stories");
    expect(chip.dataset.moved).toBe("true");
    expect(document.activeElement).toBe(chip);
  });

  it("still follows the story itself into an open stage", async () => {
    await mountApplying("lanes");
    await moveFromMenu(2, "Writing");
    expect($("[data-status='writing'] [data-story-id='2']")?.dataset.moved).toBe("true");
    expect(document.activeElement).toBe($("[data-story-title='2']"));
  });
});

describe("Dense column widths", () => {
  it("keeps populated stages readable beside empty slots and scrolls sideways instead", async () => {
    await mount("dense");
    expect($("[data-status='reporting']")!.className).toMatch(/\bmin-w-56\b/);
    expect($("[data-status='reporting']")!.className).not.toMatch(/\bmin-w-0\b/);
    expect($("[data-board-scroller]")!.className).toContain("overflow-x-auto");
  });
});
