import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../src/admin-ui/ui/tooltip";
import { StoryPeekContent, type StoryPeekContentProps } from "../src/story/StoryPeek";
import { ProductionSummary, StoryNotesIndicator, StorySignals } from "../src/story/story-parts";
import {
  initials,
  moreOpenNotesLabel,
  openArticleNotesLabel,
  openNotesLabel,
  openNotesSignal,
  repliesLabel,
  resolvedNotesLabel,
  visibleNotes,
  type ArticleNotePreview,
  type ArticleNotesSummary
} from "../src/story/notes-model";
import type { PlanningStory } from "../src/planning/planning-model";
import { createWorkspaceClient } from "../src/workspace/workspace-api";
import { ArticleNotesCard, NotesSection } from "../src/workspace/NotesSection";
import { WorkspaceContext, type WorkspaceContextValue } from "../src/workspace/workspace-context";
import type { StoryWorkspace } from "../src/workspace/workspace-types";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const now = new Date("2026-10-21T12:00:00Z");
const timezone = "America/New_York";
const editUrl = "https://cms.example.test/wp-admin/post.php?post=7&action=edit";

const summary = (patch: Partial<ArticleNotesSummary> = {}): ArticleNotesSummary => ({ available: true, canView: true, openCount: 3, resolvedCount: 7, editUrl, ...patch });
const preview = (id: number, name: string, excerpt: string, patch: Partial<ArticleNotePreview> = {}): ArticleNotePreview => ({
  id, author: { id: id + 100, name }, excerpt, createdAt: "2026-10-21T11:48:00Z", updatedAt: null, replyCount: 0, ...patch
});
const previews = [
  preview(1, "Caroline Elrod", "Can we verify when this actually happened?", { replyCount: 2, updatedAt: "2026-10-21T11:48:00Z" }),
  preview(2, "Gibson Bell", "This number needs a source.", { createdAt: "2026-10-21T11:29:00Z", replyCount: 1 })
];
const card = (props: Partial<Parameters<typeof ArticleNotesCard>[0]> = {}) => renderToStaticMarkup(
  <ArticleNotesCard summary={summary()} notes={previews} status="ready" onRetry={vi.fn()} timezone={timezone} now={now} {...props} />
);

describe("Article Notes model", () => {
  it("shows Notes only when available and viewable", () => {
    expect(visibleNotes(summary())).not.toBeNull();
    expect(visibleNotes(null)).toBeNull();
    expect(visibleNotes(undefined)).toBeNull();
    expect(visibleNotes(summary({ available: false }))).toBeNull();
    expect(visibleNotes(summary({ canView: false }))).toBeNull();
  });

  it("uses correct singular and plural copy", () => {
    expect(openNotesLabel(1)).toBe("1 open note");
    expect(openNotesLabel(3)).toBe("3 open notes");
    expect(openArticleNotesLabel(1)).toBe("1 open article note");
    expect(openArticleNotesLabel(12)).toBe("12 open article notes");
    expect(repliesLabel(1)).toBe("1 reply");
    expect(repliesLabel(2)).toBe("2 replies");
    expect(resolvedNotesLabel(5)).toBe("5 resolved");
    expect(moreOpenNotesLabel(7, 3)).toBe("+4 more open notes");
    expect(moreOpenNotesLabel(4, 3)).toBe("+1 more open note");
    expect(moreOpenNotesLabel(3, 3)).toBeNull();
    expect(moreOpenNotesLabel(2, 3)).toBeNull();
  });

  it("derives avatar initials", () => {
    expect(initials("Caroline Elrod")).toBe("CE");
    expect(initials("Maycie Anne Photographer")).toBe("MP");
    expect(initials("madonna")).toBe("M");
    expect(initials("  ")).toBe("?");
  });

  it("signals only a positive open count a viewer may see", () => {
    expect(openNotesSignal(summary({ openCount: 3 }))).toBe(3);
    expect(openNotesSignal(summary({ openCount: 0 }))).toBe(0);
    expect(openNotesSignal(summary({ available: false, openCount: 3 }))).toBe(0);
    expect(openNotesSignal(summary({ canView: false, openCount: 3 }))).toBe(0);
    expect(openNotesSignal(null)).toBe(0);
    expect(openNotesSignal(undefined)).toBe(0);
  });
});

describe("Article Notes card", () => {
  it("summarises open threads with author, relative time, excerpt and replies", () => {
    const html = card();
    expect(html).toContain("Article Notes");
    expect(html).toContain("3 open");
    expect(html).toContain("Caroline Elrod");
    expect(html).toContain("Gibson Bell");
    expect(html).toContain("Can we verify when this actually happened?");
    expect(html).toContain("12m ago");
    expect(html).toContain("31m ago");
    expect(html).toContain("2 replies");
    expect(html).toContain("1 reply");
    expect(html).toContain("+1 more open note");
    expect(html).toContain("7 resolved");
    expect(html).not.toContain("0 replies");
  });

  it("is built from the shared admin UI, not custom markup or legacy components", () => {
    const html = card();
    for (const slot of ["card", "card-header", "card-title", "card-action", "badge", "item-group", "item", "avatar", "avatar-fallback", "card-footer"]) expect(html).toContain(`data-slot="${slot}"`);
    const source = read("workspace/NotesSection.tsx");
    expect(source).not.toContain("@wordpress/components");
    expect(source).not.toContain("<img");
  });

  it("falls back to initials in a shadcn Avatar, with or without a picture", () => {
    const html = card({ notes: [preview(1, "Caroline Elrod", "Hi"), { ...preview(2, "Gibson Bell", "Hello"), author: { id: 9, name: "Gibson Bell", avatarUrl: "https://example.test/gibson.jpg" } }] });
    expect(html).toContain(">CE<");
    expect(html).toContain(">GB<");
    expect(html).not.toContain("<img");
  });

  it("opens the real editor in a new tab and never claims a deep link", () => {
    const html = card();
    const link = html.match(/<a[^>]*>(?:(?!<\/a>).)*Review notes in editor[^<]*/)![0];
    expect(link).toContain(`href="${editUrl.replace("&", "&amp;")}"`);
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(html).toContain("(opens in a new tab)");
    expect(html).not.toContain("#wp-notes");
    expect(html).not.toMatch(/href="[^"]*#/);
  });

  it("shows a lightweight empty state, with the resolved count when there is one", () => {
    const empty = card({ summary: summary({ openCount: 0, resolvedCount: 5 }), notes: [] });
    expect(empty).toContain("No open article notes");
    expect(empty).toContain("Copy-editing comments and suggestions will appear here.");
    expect(empty).toContain("5 resolved");
    expect(empty).not.toContain("open</span>");
    expect(empty).toContain("Open article in editor");
    expect(empty).not.toContain('data-slot="item-group"');
    expect(card({ summary: summary({ openCount: 0, resolvedCount: 0 }), notes: [] })).not.toContain("resolved");
  });

  it("shows placeholders while previews load and keeps the counts and the editor link", () => {
    const html = card({ status: "loading", notes: [] });
    expect(html).toContain('aria-label="Loading article notes"');
    expect(html).toContain('data-slot="skeleton"');
    expect(html).toContain("3 open");
    expect(html).toContain("Review notes in editor");
    expect(html).not.toContain("Caroline Elrod");
  });

  it("reports a failed preview without hiding the counts or the editor link", () => {
    const html = card({ status: "error", notes: [] });
    expect(html).toContain("load article notes");
    expect(html).toContain("3 open");
    expect(html).toContain("Review notes in editor");
  });

  it("limits long excerpts and long words from breaking the layout", () => {
    const html = card({ notes: [preview(1, "A".repeat(80), "word".repeat(200))] });
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain("truncate");
  });

  it("omits the editor link when there is nowhere honest to send people", () => {
    expect(card({ summary: summary({ editUrl: "" }) })).not.toContain("<a ");
  });
});

function section(notes: ArticleNotesSummary | null | undefined, getNotes = vi.fn()) {
  const value = { storyId: 7, client: { getNotes }, data: { story: { notes } }, timezone, now } as unknown as WorkspaceContextValue;
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><WorkspaceContext value={value}><NotesSection /></WorkspaceContext></QueryClientProvider>);
  return { html, getNotes };
}

describe("Article Notes in the Story Workspace", () => {
  it("omits the card, and never asks for Notes, when the viewer may not see them", () => {
    for (const hidden of [null, undefined, summary({ available: false }), summary({ canView: false })]) {
      const { html, getNotes } = section(hidden);
      expect(html).toBe("");
      expect(getNotes).not.toHaveBeenCalled();
    }
  });

  it("renders the loading card for an editor with open Notes", () => {
    const { html } = section(summary());
    expect(html).toContain("Article Notes");
    expect(html).toContain("3 open");
    expect(html).toContain('aria-label="Loading article notes"');
  });

  it("renders the empty card for an editor with no open Notes, without fetching previews", () => {
    const { html, getNotes } = section(summary({ openCount: 0 }));
    expect(html).toContain("No open article notes");
    expect(getNotes).not.toHaveBeenCalled();
  });

  it("is placed between Details and Files & Links in the context column", () => {
    const source = read("workspace/StoryWorkspace.tsx");
    expect(source.indexOf("<DetailsSection />")).toBeLessThan(source.indexOf("<NotesSection />"));
    expect(source.indexOf("<NotesSection />")).toBeLessThan(source.indexOf("<ResourcesSection />"));
    expect(source.indexOf("<ResourcesSection />")).toBeLessThan(source.indexOf("<ActivitySection />"));
  });
});

const admin = { id: 1, kind: "user" as const, name: "admin", imageUrl: "https://example.test/admin.jpg" };
const capabilities = { role: "manager", editArticle: true, changeStatus: false, assign: false, editContributors: false, editBrief: false, manageReporting: false, addSource: false, addAppointment: false, manageMedia: false, assignMedia: false, addTask: false, manageResources: false, review: false };
function workspace(notes: ArticleNotesSummary | null | undefined): StoryWorkspace {
  return {
    story: { id: 7, title: "Canteen", editUrl, authors: [admin], editor: null, workflow: { id: "reporting", label: "Reporting" }, wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: "2026-10-21", plannedPublication: null, ...(notes !== undefined ? { notes } : {}) },
    revision: 1, timezone, now: now.toISOString(), currentUser: admin, brief: "", sections: [],
    contributors: { canEdit: false, contributors: [admin], available: [] }, statuses: [], tasks: [], sources: [], appointments: [],
    reporting: { sources: 0, interviewed: 0, needsScheduling: 0, toSchedule: 0, nextAppointment: null }, mediaAssignments: [], resources: [], activity: [],
    previewUrl: "", people: [admin], capabilities, errors: {}
  } as unknown as StoryWorkspace;
}
const peek = (data: StoryWorkspace) => renderToStaticMarkup(<StoryPeekContent {...({
  data, timezone, now, workspaceUrl: (id: number) => `/wp-admin/admin.php?page=byline-planning&story=${id}`,
  onNewTask: vi.fn(), onComplete: vi.fn(), onUpdateTask: vi.fn(), onEditTask: vi.fn(), onPlan: vi.fn(), onWriters: vi.fn(), onSaveLink: vi.fn(), onRemoveLink: vi.fn(),
  planning: false, writing: false, linking: false, error: "", linkError: "", linkFormOpen: false, onLinkForm: vi.fn()
} satisfies StoryPeekContentProps)} />);

describe("Article Notes in Story Peek", () => {
  it("shows one quiet row whose whole target opens the editor", () => {
    const html = peek(workspace(summary({ openCount: 3 })));
    expect(html).toContain("Article notes");
    expect(html).toContain("3 open notes");
    expect(html).toContain("Review in editor");
    const link = html.match(/<a[^>]*data-peek-notes[^>]*>/)![0];
    expect(link).toContain(`href="${editUrl.replace("&", "&amp;")}"`);
    expect(link).toContain('target="_blank"');
    expect(html).not.toContain("7 resolved");
  });

  it("uses singular copy for one open note", () => {
    expect(peek(workspace(summary({ openCount: 1 })))).toContain("1 open note<");
  });

  it("shows nothing when there are no open Notes, Notes are unavailable, or the viewer may not see them", () => {
    for (const hidden of [summary({ openCount: 0 }), summary({ available: false }), summary({ canView: false }), null, undefined]) {
      const html = peek(workspace(hidden));
      expect(html).not.toContain("Article notes");
      expect(html).not.toContain("data-peek-notes");
    }
  });

  it("never fetches Note threads just because Peek opened", () => {
    expect(read("story/StoryPeek.tsx")).not.toContain("getNotes");
    expect(read("story/StoryPeek.tsx")).not.toContain("articleNotesKey");
  });
});

function story(notes: ArticleNotesSummary | null | undefined): PlanningStory {
  return {
    id: 7, title: "Canteen", editUrl, authors: [], writer: null, editor: null,
    workflow: { id: "reporting", label: "Reporting", group: "main", selectable: true },
    wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false },
    deadline: null, plannedPublication: null, modifiedAt: null, visual: { type: "none", status: "needed" }, openTaskCount: 0, coverage: [], featuredImage: null,
    ...(notes !== undefined ? { notes } : {})
  } as PlanningStory;
}
const withTooltips = (node: React.ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

describe("Article Notes in Planning", () => {
  it("adds a subtle icon and count, read aloud in full", () => {
    const html = withTooltips(<StoryNotesIndicator story={story(summary({ openCount: 3 }))} />);
    expect(html).toContain('data-story-notes="3"');
    expect(html).toContain("text-muted-foreground");
    expect(html).toContain('<span aria-hidden="true">3</span>');
    expect(html).toContain("3 open article notes");
    expect(html).toContain("lucide-message-square-text");
  });

  it("uses singular copy and omits the resolved count in dense views", () => {
    const html = withTooltips(<StoryNotesIndicator story={story(summary({ openCount: 1, resolvedCount: 9 }))} />);
    expect(html).toContain("1 open article note");
    expect(html).not.toContain("9");
    expect(html).not.toContain("resolved");
  });

  it("renders nothing for a story without a visible open Note", () => {
    for (const hidden of [summary({ openCount: 0 }), summary({ available: false }), summary({ canView: false }), null, undefined]) {
      expect(withTooltips(<StoryNotesIndicator story={story(hidden)} />)).toBe("");
      expect(withTooltips(<StorySignals story={story(hidden)} />)).toBe("");
      expect(withTooltips(<ProductionSummary story={story(hidden)} empty={null} />)).toBe("");
    }
  });

  it("sits beside the other signals in the board and list without becoming a badge", () => {
    const withTask = { ...story(summary({ openCount: 2 })), openTaskCount: 1 };
    const board = withTooltips(<StorySignals story={withTask} />);
    expect(board.indexOf("1 task")).toBeLessThan(board.indexOf("data-story-notes"));
    const list = withTooltips(<ProductionSummary story={withTask} />);
    expect(list).toContain("data-story-notes");
    expect(withTooltips(<StoryNotesIndicator story={withTask} />)).not.toContain('data-slot="badge"');
  });
});

describe("Article Notes API", () => {
  it("reads previews with a bounded limit and has no way to change Notes", async () => {
    const request = vi.fn().mockResolvedValue({ summary: summary(), open: [] });
    const client = createWorkspaceClient(request);
    await client.getNotes(7, 3);
    expect(request).toHaveBeenCalledWith({ path: "/byline/v1/editorial/stories/7/notes?limit=3" });
    expect(Object.keys(client).filter((name) => /note/i.test(name))).toEqual(["getNotes"]);
    expect(request.mock.calls.every(([options]) => !options.method || options.method === "GET")).toBe(true);
  });

  it("keeps Notes out of the workspace query key so task edits never refetch them", () => {
    const source = read("workspace/workspace-query.ts");
    expect(source).toContain('["byline", "article-notes", storyId]');
  });
});
