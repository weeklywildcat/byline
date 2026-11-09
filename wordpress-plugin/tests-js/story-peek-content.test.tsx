import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StoryPeekContent, type StoryPeekContentProps } from "@byline/newsroom-screens/story/StoryPeek";
import { FileAttachment } from "@byline/newsroom-screens/workspace/MediaDialog";
import type { StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";

const now = new Date("2026-10-20T12:00:00Z");
const admin = { id: 1, kind: "user" as const, name: "admin", imageUrl: "https://example.test/admin.jpg" };
const capabilities = { role: "manager", editArticle: true, changeStatus: false, assign: false, editContributors: false, editBrief: false, manageReporting: false, addSource: false, addAppointment: false, manageMedia: false, assignMedia: false, addTask: false, manageResources: false, review: false };

/** The Canteen story as WordPress serves it: no Story Attention, two tasks, a photo request, links and activity. */
function canteen(patch: Record<string, unknown> = {}): StoryWorkspace {
  return {
    story: { id: 7, title: "Canteen", editUrl: "/wp-admin/post.php?post=7&action=edit", authors: [admin], editor: null, workflow: { id: "reporting", label: "Reporting" }, publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: "2026-10-23", plannedPublication: null },
    revision: 1, timezone: "America/New_York", now: now.toISOString(), currentUser: admin, brief: "", sections: ["News"],
    contributors: { canEdit: false, contributors: [admin], available: [] }, statuses: [],
    tasks: [{ id: 1, title: "Interview 3 students", state: "open", priority: "normal", dueAt: "2026-10-19T16:00:00Z", order: 1 }],
    sources: [], appointments: [], reporting: { sources: 0, interviewed: 0, needsScheduling: 0, toSchedule: 0, nextAppointment: null },
    mediaAssignments: [{ id: "m1", title: "", type: "photo", status: "assigned", assigneeId: 1, assignee: admin, dueAt: "2026-10-21T18:00:00Z", notes: "", attachmentIds: [], attachments: [], invalidAttachmentIds: [], mediaReadiness: null, featuredAttachmentId: null, order: 0, isLegacy: false, createdAt: "", updatedAt: "" }],
    resources: [{ id: "r1", label: "Mrs. Hamby questions", url: "https://docs.google.com/document/d/1/edit", kind: "Google Doc", purpose: "interview-notes" }],
    activity: [{ id: "a1", action: "task_created", occurredAt: "2026-10-20T10:00:00Z", summary: "Activity 1", story: { id: 7, title: "Canteen" }, actor: { id: 1, name: "admin" } }],
    previewUrl: "https://example.test/?p=7&preview=true", people: [admin], capabilities, errors: {}, ...patch
  } as unknown as StoryWorkspace;
}

const props = (data: StoryWorkspace): StoryPeekContentProps => ({
  data, timezone: "America/New_York", now, workspaceUrl: (id) => `/wp-admin/admin.php?page=byline-planning&story=${id}`,
  onPlan: vi.fn(), onWriters: vi.fn(), planning: false, writing: false, error: ""
});
const render = (data: StoryWorkspace) => renderToStaticMarkup(<StoryPeekContent {...props(data)} />);

describe("Story Peek on WordPress", () => {
  const html = render(canteen());

  it("says who and when, and is not a miniature workspace", () => {
    expect(html).toContain("admin");
    expect(html).toContain("Due Friday");
    for (const gone of ["Interview 3 students", "Production", "Files &amp; links", "Mrs. Hamby questions", "Recent activity", "Story details"]) expect(html).not.toContain(gone);
  });

  it("ends with Preview and Open story, which opens the Story Workspace", () => {
    expect(html.indexOf("Preview")).toBeLessThan(html.indexOf("Open story"));
    const open = html.match(/<a[^>]*data-peek-open[^>]*>/)![0];
    expect(open).toContain('href="/wp-admin/admin.php?page=byline-planning&amp;story=7"');
    expect(open).toContain("bg-primary");
  });

  it("without Story Attention, Next falls back to the next appointment", () => {
    const next = render(canteen({ reporting: { sources: 1, interviewed: 0, needsScheduling: 0, toSchedule: 0, nextAppointment: { id: 3, title: "Principal Smith interview", startAt: "2026-10-21T12:00:00Z", windowStart: null, windowEnd: null, scheduleMode: "exact" } } }));
    expect(next).toContain("Principal Smith interview");
    expect(html).toContain("Nothing needs attention right now.");
  });

  it("offers quick edits only to someone who may make them", () => {
    expect(html).not.toContain("<button");
    const editor = render(canteen({ capabilities: { ...capabilities, assign: true }, contributors: { canEdit: true, contributors: [admin], available: [admin] } }));
    expect(editor).toContain('aria-label="Writers: admin"');
    expect(editor).toContain('aria-label="Editor: none"');
    expect(editor).toContain('aria-label="Change deadline"');
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
