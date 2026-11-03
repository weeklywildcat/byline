import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgendaItem, AttentionRow, MediaAssignmentRow, ReviewRow, StoryRow } from "../src/home/components/rows";
import { ActivityRow, TaskRow } from "../src/story/rows";
import type { PlanningStory } from "../src/planning/planning-model";

const now = new Date("2026-10-20T12:00:00Z");
const timezone = "America/New_York";
const encoded = "Debate team&#8217;s streak &amp; more";
const decoded = "Debate team’s streak &amp; more";

function story(): PlanningStory {
  return {
    id: 17,
    title: encoded,
    editUrl: "/wp-admin/post.php?post=17&action=edit",
    previewUrl: "/?p=17&preview=true",
    authors: [],
    writer: null,
    editor: null,
    workflow: { id: "reporting", label: "Reporting", group: "main", selectable: true },
    wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false },
    deadline: "2026-10-21",
    plannedPublication: null,
    modifiedAt: "2026-10-20T10:00:00Z",
    visual: { type: "none", status: "needed" },
    openTaskCount: 1,
    coverage: [],
    featuredImage: null
  };
}

function expectDecoded(html: string) {
  expect(html).toContain(decoded);
  expect(html).not.toContain("&amp;#8217;");
  expect(html).not.toContain("&amp;amp;");
}

describe("Home WordPress title entities", () => {
  it("decodes titles in My Stories and review rows", () => {
    expectDecoded(renderToStaticMarkup(<StoryRow story={story()} timezone={timezone} now={now} onOpen={vi.fn()} />));
    expectDecoded(renderToStaticMarkup(<ReviewRow storyId={17} title={encoded} detail="Ready for review" onOpen={vi.fn()} />));
  });

  it("decodes story titles carried through agenda, attention, and production rows", () => {
    expectDecoded(renderToStaticMarkup(<AgendaItem event={{ id: "deadline-17", storyId: 17, title: encoded, detail: "", label: "Story deadline", date: "2026-10-21", day: "2026-10-21" }} timezone={timezone} onOpen={vi.fn()} />));
    expectDecoded(renderToStaticMarkup(<AttentionRow item={{ id: "late-17", storyId: 17, title: encoded, detail: "Story deadline has passed", urgent: true }} onOpen={vi.fn()} />));
    expectDecoded(renderToStaticMarkup(<MediaAssignmentRow media={{ id: "photo", story: { id: 17, title: encoded, editUrl: story().editUrl }, title: "", type: "photo", status: "assigned", assignee: null, dueAt: "2026-10-21", notes: "", attachmentIds: [] }} timezone={timezone} now={now} onOpen={vi.fn()} />));
  });

  it("decodes story context in shared task and activity rows", () => {
    expectDecoded(renderToStaticMarkup(<TaskRow task={{ id: 8, title: "Finish draft", state: "open", priority: "normal", dueAt: "2026-10-21", order: 0 }} storyTitle={encoded} timezone={timezone} now={now} onOpen={vi.fn()} onComplete={vi.fn()} />));
    expectDecoded(renderToStaticMarkup(<ActivityRow item={{ id: "a1", action: "story_updated", occurredAt: "2026-10-20T10:00:00Z", summary: "Updated story", story: { id: 17, title: encoded }, actor: { id: 1, name: "Editor" } }} timezone={timezone} now={now} />));
  });
});

describe("Today work queue density", () => {
  it("keeps separated rows and readable clamped headlines in each Home queue", () => {
    const rows = [
      <StoryRow story={story()} timezone={timezone} now={now} onOpen={vi.fn()} />,
      <ReviewRow storyId={17} title={encoded} detail="Caroline Elrod" onOpen={vi.fn()} />,
      <AgendaItem event={{ id: "deadline-17", storyId: 17, title: encoded, detail: "", label: "Story deadline", date: "2026-10-21", day: "2026-10-21" }} timezone={timezone} onOpen={vi.fn()} />,
      <AttentionRow item={{ id: "late-17", storyId: 17, title: encoded, detail: "Story deadline has passed", urgent: true }} onOpen={vi.fn()} />,
      <MediaAssignmentRow media={{ id: "photo", story: { id: 17, title: encoded, editUrl: story().editUrl }, title: "Photos", type: "photo", status: "needed", assignee: null, dueAt: "2026-10-21", notes: "", attachmentIds: [] }} timezone={timezone} now={now} onOpen={vi.fn()} />
    ];
    for (const row of rows) {
      const html = renderToStaticMarkup(row);
      expect(html).toContain("border-b border-border/70");
      expect(html).toContain("hover:bg-muted/40");
      expect(html).toContain("w-full line-clamp-2");
      expectDecoded(html);
    }
  });

  it("shows a single writer's profile photo and preserves overdue text and workflow color", () => {
    const writer = { id: 2, name: "Caroline Elrod", avatarUrl: "https://example.test/caroline.png" };
    const item = { ...story(), authors: [writer], deadline: "2026-10-19" };
    const html = renderToStaticMarkup(<StoryRow story={item} timezone={timezone} now={now} onOpen={vi.fn()} />);
    expect(html).toContain('data-slot="avatar"');
    expect(html).toContain('aria-label="Caroline Elrod"');
    expect(html).toContain("1d overdue");
    expect(html).toContain("text-warning");
    expect(html).toContain('data-work-kind="reporting"');
    expect(html).toMatch(/aria-label="Debate team’s streak &amp; more Due/);
    expect(renderToStaticMarkup(<ReviewRow storyId={17} title={encoded} detail={writer.name} people={[writer]} onOpen={vi.fn()} />)).toContain('data-slot="avatar"');
    expect(renderToStaticMarkup(<StoryRow story={story()} timezone={timezone} now={now} onOpen={vi.fn()} />)).not.toContain('data-slot="avatar"');
  });

  it("opts Today tasks into density while retaining the same inline editors and default task layout", () => {
    const props = { task: { id: 8, title: "Finish draft", state: "open" as const, priority: "normal" as const, dueAt: "2026-10-21", order: 0 }, storyTitle: encoded, timezone, now, onOpen: vi.fn(), onEdit: vi.fn(), onComplete: vi.fn(), onUpdate: vi.fn(), canAssign: true };
    const normal = renderToStaticMarkup(<TaskRow {...props} />);
    const dense = renderToStaticMarkup(<TaskRow {...props} dense />);
    for (const html of [normal, dense]) {
      for (const label of ["Complete Finish draft", "Edit Finish draft", "Task assignee", "Task priority: normal", "Change task due date"]) expect(html).toContain(label);
    }
    expect(dense).toContain("@container/work-row");
    expect(dense).toContain("border-b border-border/70");
    expect(normal).not.toContain("@container/work-row");
    expect(normal).not.toContain("border-border/70");
  });
});
