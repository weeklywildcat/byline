import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StoryPeekContent, type StoryPeekContentProps } from "../src/story/StoryPeek";
import { FileAttachment } from "../src/workspace/MediaDialog";
import type { StoryWorkspace } from "../src/workspace/workspace-types";

const now = new Date("2026-10-20T12:00:00Z");
const admin = { id: 1, kind: "user" as const, name: "admin", imageUrl: "https://example.test/admin.jpg" };
const capabilities = { role: "manager", editArticle: true, changeStatus: false, assign: false, editContributors: false, editBrief: false, manageReporting: false, addSource: false, addAppointment: false, manageMedia: false, assignMedia: false, addTask: false, manageResources: false, review: false };

/** The sparse Canteen story: one writer, two tasks, one assigned photo request, nothing else. */
function canteen(patch: Record<string, unknown> = {}): StoryWorkspace {
  return {
    story: { id: 7, title: "Canteen", editUrl: "/wp-admin/post.php?post=7&action=edit", authors: [admin], editor: null, workflow: { id: "reporting", label: "Reporting" }, wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: "2026-10-21", plannedPublication: null },
    revision: 1, timezone: "America/New_York", now: now.toISOString(), currentUser: admin, brief: "", sections: ["News"],
    contributors: { canEdit: false, contributors: [admin], available: [] }, statuses: [],
    tasks: [
      { id: 1, title: "Interview 3 students", state: "open", priority: "normal", dueAt: "2026-10-19T16:00:00Z", order: 1 },
      { id: 2, title: "Finish first draft", state: "open", priority: "normal", dueAt: "2026-10-20T17:00:00Z", order: 2 }
    ],
    sources: [], appointments: [], reporting: { sources: 0, interviewed: 0, needsScheduling: 0, toSchedule: 0, nextAppointment: null },
    mediaAssignments: [{ id: "m1", title: "", type: "photo", status: "assigned", assigneeId: 1, assignee: admin, dueAt: "2026-10-21T18:00:00Z", notes: "", attachmentIds: [], attachments: [], invalidAttachmentIds: [], mediaReadiness: null, featuredAttachmentId: null, order: 0, isLegacy: false, createdAt: "", updatedAt: "" }],
    resources: [], activity: [], previewUrl: "https://example.test/?p=7&preview=true", people: [admin], capabilities, errors: {}, ...patch
  } as unknown as StoryWorkspace;
}

const props = (data: StoryWorkspace): StoryPeekContentProps => ({
  data, timezone: "America/New_York", now, workspaceUrl: (id) => `/wp-admin/admin.php?page=byline-planning&story=${id}`,
  onNewTask: vi.fn(), onComplete: vi.fn(), onPlan: vi.fn(), onWriters: vi.fn(), onSaveLink: vi.fn(), onRemoveLink: vi.fn(),
  planning: false, writing: false, linking: false, error: "", linkError: "", linkFormOpen: false, onLinkForm: vi.fn()
});
const render = (data: StoryWorkspace) => renderToStaticMarkup(<StoryPeekContent {...props(data)} />);

describe("Story Peek, sparse", () => {
  const html = render(canteen());

  it("omits Recent activity entirely when there is none, and sections with nothing to show or do", () => {
    expect(html).not.toContain("Recent activity");
    expect(html).not.toContain("Files &amp; links");
    expect(html).not.toContain("No sources or interviews yet");
  });

  it("keeps what exists: details, tasks, and production with the assignee shown as a person", () => {
    expect(html).toContain("Story details");
    expect(html).toContain("Interview 3 students");
    expect(html).toContain("1d overdue");
    expect(html).toContain("Production");
    expect(html).toContain('aria-label="admin"');
    expect(html).toContain("Photo · admin");
    expect(html).toContain("Due Oct 21");
  });

  it("puts the full workspace on the left of the footer and Edit article as the one primary action", () => {
    expect(html.indexOf("Open workspace")).toBeLessThan(html.indexOf("Preview"));
    expect(html.indexOf("Preview")).toBeLessThan(html.indexOf("Edit article"));
    const anchor = (label: string) => html.match(new RegExp(`<a[^>]*class="([^"]*)"[^>]*>(?:(?!</a>).)*${label}`))![1]!;
    expect(anchor("Edit article")).toContain("bg-primary");
    expect(anchor("Open workspace")).not.toContain("bg-primary");
    expect(anchor("Preview")).not.toContain("bg-primary");
  });

  it("shows a compact native Empty for Reporting, with the add actions, only to people who can add", () => {
    const manager = render(canteen({ capabilities: { ...capabilities, addSource: true, addAppointment: true } }));
    expect(manager).toContain('data-slot="empty"');
    expect(manager).toContain("No sources or interviews yet.");
    expect(manager).toContain("Add people you plan to talk to.");
    expect(manager).toContain("Add source");
    expect(manager).toContain("Add appointment");
    expect(manager).toContain("items-start");
  });
});

describe("Story Peek, dense", () => {
  const people = ["Caroline Elrod", "Gibson Bell", "Maycie Photographer", "Dana Reyes"].map((name, index) => ({ id: index + 2, kind: "user" as const, name, imageUrl: `https://example.test/${index}.jpg` }));
  const activity = Array.from({ length: 5 }, (_, index) => ({ id: `a${index}`, action: "task_created", occurredAt: "2026-10-20T10:00:00Z", summary: `Activity ${index}`, story: { id: 7, title: "Canteen" }, actor: { id: 1, name: "admin" } }));
  const html = render(canteen({
    contributors: { canEdit: true, contributors: people, available: people },
    capabilities: { ...capabilities, addTask: true, manageResources: true, addSource: true },
    resources: [{ id: "r1", label: "Mrs. Hamby questions", url: "https://docs.google.com/document/d/1/edit", kind: "Google Doc", purpose: "interview-notes" }, { id: "r2", label: "Research folder", url: "https://drive.google.com/drive/folders/2", kind: "Drive folder", purpose: "folder" }],
    activity,
    reporting: { sources: 3, interviewed: 1, needsScheduling: 1, toSchedule: 1, nextAppointment: null }
  }));

  it("shows four writers as three avatars and a +1", () => {
    expect(html).toContain('data-slot="avatar-group-count"');
    expect(html).toContain("+1");
  });

  it("lists links as Items that open in a new tab, with management in a menu rather than a trash icon per row", () => {
    expect(html).toContain('href="https://docs.google.com/document/d/1/edit"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Actions for Mrs. Hamby questions");
    expect(html).not.toContain("Remove Mrs. Hamby questions");
  });

  it("shows the roll-up and only the first three activity rows, with a way to see the rest", () => {
    expect(html).toContain("3 sources · 1 interviewed · 1 needs scheduling");
    expect((html.match(/data-slot="item"[^>]*data-size="xs"/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("View activity");
  });
});

describe("linked Media Library files", () => {
  it("render as a native Attachment: an image preview, a title, and an accessible remove action", () => {
    const html = renderToStaticMarkup(<FileAttachment preview={{ id: 12, title: "lunch-line.jpg", previewUrl: "https://example.test/lunch.jpg", mimeType: "image/jpeg" }} unavailable={false} onRemove={() => undefined} />);
    expect(html).toContain('data-slot="attachment"');
    expect(html).toContain('data-variant="image"');
    expect(html).toContain("<img");
    expect(html).toContain("lunch-line.jpg");
    expect(html).toContain('aria-label="Remove lunch-line.jpg"');
  });

  it("render a file icon for non-images and keep failure in text, not colour alone", () => {
    const html = renderToStaticMarkup(<FileAttachment preview={{ id: 13, title: "File 13", previewUrl: null, mimeType: "application/pdf" }} unavailable onRemove={() => undefined} />);
    expect(html).toContain('data-variant="icon"');
    expect(html).toContain('data-state="error"');
    expect(html).toContain("can&#x27;t be read");
  });
});
