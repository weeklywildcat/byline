import { describe, expect, it } from "vitest";
import { defaultWorkspace, hasArticleText, parseStoryLocation, storyLocationSearch } from "../src/ui/story/story-view";
import { normalizeWorkspaceMemory, REMEMBERED_STORIES, rememberedWorkspace, rememberWorkspace } from "../src/ui/story/story-workspace-memory-model";

const paragraph = (text: string) => ({ type: "paragraph", children: text ? [{ type: "text", text }] : [] });
const body = (...children: unknown[]) => ({ root: { type: "root", children } });

describe("Story addresses (docs/story-screen.md)", () => {
  it("names Plan and Write as workspaces, and Review and History as focused views", () => {
    expect(parseStoryLocation("?view=plan")).toMatchObject({ workspace: "plan", mode: null });
    expect(parseStoryLocation("?view=write")).toMatchObject({ workspace: "write", mode: null });
    expect(parseStoryLocation("?view=review")).toMatchObject({ workspace: null, mode: "review" });
    expect(parseStoryLocation("?view=history")).toMatchObject({ workspace: null, mode: "history" });
    // No workspace named: the Story's default decides (never the lifecycle).
    expect(parseStoryLocation("")).toMatchObject({ workspace: null, mode: null, section: null });
  });

  it("keeps every old link working", () => {
    expect(parseStoryLocation("?view=reporting")).toMatchObject({ workspace: "plan", section: "reporting", mode: null });
    expect(parseStoryLocation("?tab=reporting")).toMatchObject({ workspace: "plan", section: "reporting" });
    expect(parseStoryLocation("?tab=plan")).toMatchObject({ workspace: "plan", section: null });
    expect(parseStoryLocation("?tab=production")).toMatchObject({ workspace: "plan", section: "todo" });
    expect(parseStoryLocation("?tab=write")).toMatchObject({ workspace: "write" });
    expect(parseStoryLocation("?tab=live")).toMatchObject({ workspace: "write" });
    expect(parseStoryLocation("?tab=publish")).toMatchObject({ workspace: "write" });
    expect(parseStoryLocation("?tab=history")).toMatchObject({ mode: "history" });
    expect(parseStoryLocation("?tab=nonsense")).toMatchObject({ workspace: null, mode: null });
    // Story notes' old link (and its new one) open Plan's Activity.
    expect(parseStoryLocation("?view=plan&section=activity")).toMatchObject({ workspace: "plan", section: "activity" });
  });

  it("treats appointments, captures and transcripts as Reporting intent", () => {
    expect(parseStoryLocation("?appointment=abc")).toMatchObject({ workspace: "plan", section: "reporting", appointment: "abc" });
    expect(parseStoryLocation("?capture=record")).toMatchObject({ workspace: "plan", section: "reporting", capture: "record" });
    expect(parseStoryLocation("?capture=nope").capture).toBeNull();
    expect(parseStoryLocation("?transcript=12")).toMatchObject({ workspace: "plan", mode: "transcript", transcript: 12 });
    // A notification's old `?tab=reporting&transcript=` still opens the transcript.
    expect(parseStoryLocation("?tab=reporting&transcript=7")).toMatchObject({ mode: "transcript", transcript: 7 });
    expect(parseStoryLocation("?transcript=-1")).toMatchObject({ mode: null, transcript: null });
    // An explicit focused view wins over a transcript id.
    expect(parseStoryLocation("?view=history&transcript=7")).toMatchObject({ mode: "history" });
  });

  it("writes canonical addresses, keeping unrelated parameters and dropping the old ones", () => {
    expect(storyLocationSearch("?tab=reporting&appointment=x", { workspace: "write" })).toBe("?view=write");
    expect(storyLocationSearch("?view=write", { workspace: "plan", section: "reporting", capture: "note" })).toBe("?view=plan&section=reporting&capture=note");
    expect(storyLocationSearch("?view=plan&section=todo", { mode: "history" })).toBe("?view=history");
    expect(storyLocationSearch("", { mode: "transcript", transcript: 9 })).toBe("?transcript=9");
    expect(storyLocationSearch("?distribution=4&view=history", { workspace: "write" })).toBe("?distribution=4&view=write");
    // A section, a capture or an appointment only belong to Plan.
    expect(storyLocationSearch("", { workspace: "write", section: "reporting", capture: "note", appointment: "a" })).toBe("?view=write");
    // Round trip.
    for (const search of ["?view=plan", "?view=write", "?view=review", "?view=history", "?transcript=3", "?view=plan&section=todo"]) {
      expect(storyLocationSearch("", parseStoryLocation(search))).toBe(search);
    }
  });
});

describe("the default workspace", () => {
  it("opens a Story with no words in Plan, and otherwise where the reader left it, else Write", () => {
    expect(defaultWorkspace({ hasArticleText: false, remembered: null })).toBe("plan");
    expect(defaultWorkspace({ hasArticleText: false, remembered: "write" })).toBe("plan");
    expect(defaultWorkspace({ hasArticleText: true, remembered: null })).toBe("write");
    expect(defaultWorkspace({ hasArticleText: true, remembered: "plan" })).toBe("plan");
    expect(defaultWorkspace({ hasArticleText: true, remembered: "write" })).toBe("write");
  });

  it("counts words and blocks as article text, never empty structure", () => {
    expect(hasArticleText(undefined)).toBe(false);
    expect(hasArticleText(body())).toBe(false);
    expect(hasArticleText(body(paragraph(""), paragraph("   ")))).toBe(false);
    expect(hasArticleText(body(paragraph(""), paragraph("The canteen closed in May.")))).toBe(true);
    expect(hasArticleText(body({ type: "block", fields: { blockType: "photo", media: 4 } }))).toBe(true);
    expect(hasArticleText(body(), "<p>Archived words</p>")).toBe(true);
    expect(hasArticleText(body(), "<p> </p>")).toBe(false);
  });
});

describe("the remembered workspace (Payload Preferences)", () => {
  it("normalizes untrusted stored data", () => {
    expect(normalizeWorkspaceMemory(undefined)).toEqual([]);
    expect(normalizeWorkspaceMemory({ stories: "x" })).toEqual([]);
    expect(normalizeWorkspaceMemory({ stories: [[1, "plan"], [2, "write"], [1, "write"], [-3, "plan"], ["4", "plan"], [5, "history"], 7] })).toEqual([[1, "plan"], [2, "write"]]);
  });

  it("keeps the most recent Stories first and bounded", () => {
    let memory = normalizeWorkspaceMemory({ stories: [] });
    memory = rememberWorkspace(memory, 1, "plan");
    memory = rememberWorkspace(memory, 2, "write");
    memory = rememberWorkspace(memory, 1, "write");
    expect(memory).toEqual([[1, "write"], [2, "write"]]);
    expect(rememberedWorkspace(memory, 2)).toBe("write");
    expect(rememberedWorkspace(memory, 3)).toBeNull();
    for (let id = 10; id < 10 + REMEMBERED_STORIES + 5; id++) memory = rememberWorkspace(memory, id, "plan");
    expect(memory).toHaveLength(REMEMBERED_STORIES);
    expect(rememberedWorkspace(memory, 1)).toBeNull();
  });
});
