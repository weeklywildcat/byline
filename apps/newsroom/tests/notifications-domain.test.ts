import { describe, expect, it } from "vitest";
import {
  defaultNotificationPreferences, describeNotification, isNotificationKind, NOTIFICATION_KINDS, notificationEmail, relativeTime, reminderFacts, resolveNotificationPreferences
} from "../src/domain/notifications";

describe("notification preferences", () => {
  it("defaults every kind on in both channels", () => {
    const defaults = defaultNotificationPreferences();
    for (const kind of NOTIFICATION_KINDS) {
      expect(defaults.inApp[kind]).toBe(true);
      expect(defaults.email[kind]).toBe(true);
    }
  });

  it("only an explicit false turns a kind off, and ignores anything it does not know", () => {
    const resolved = resolveNotificationPreferences({ inApp: { dueDigest: false, storyAssignments: "no", bogus: false }, email: null, extra: true });
    expect(resolved.inApp.dueDigest).toBe(false);
    expect(resolved.inApp.storyAssignments).toBe(true);
    expect(resolved.email.dueDigest).toBe(true);
    expect(Object.keys(resolved.inApp)).toEqual([...NOTIFICATION_KINDS]);
  });

  it("tolerates a missing or malformed stored value", () => {
    for (const value of [undefined, null, "x", 3, []]) expect(resolveNotificationPreferences(value)).toEqual(defaultNotificationPreferences());
  });

  it("recognizes the eight WordPress kinds plus Reporting's, Front Page's, Distribution's and Review's", () => {
    expect(NOTIFICATION_KINDS).toHaveLength(15);
    expect(isNotificationKind("reviewRouting")).toBe(true);
    expect(isNotificationKind("transcriptReady")).toBe(true);
    expect(isNotificationKind("frontPageFailures")).toBe(true);
    expect(isNotificationKind("dueDigest")).toBe(true);
    expect(isNotificationKind("newsletter")).toBe(false);
  });
});

describe("notification text", () => {
  const base = { actor: "Ada Reporter", story: "Budget vote delayed", detail: null };
  it("reads as a sentence for every kind", () => {
    expect(describeNotification({ ...base, kind: "storyAssignments", detail: "editor" })).toBe("Ada Reporter made you the editor of “Budget vote delayed”");
    expect(describeNotification({ ...base, kind: "storyAssignments", detail: "byline" })).toBe("Ada Reporter added you to the byline of “Budget vote delayed”");
    expect(describeNotification({ ...base, kind: "readyForReview" })).toBe("“Budget vote delayed” is ready for your review");
    expect(describeNotification({ ...base, kind: "storyReturned" })).toBe("Ada Reporter requested changes on “Budget vote delayed”");
    expect(describeNotification({ ...base, kind: "mediaAssignments", detail: "Council photos" })).toBe("Ada Reporter assigned you “Council photos” on “Budget vote delayed”");
    expect(describeNotification({ ...base, kind: "highPriorityTasks", detail: "Check quote" })).toBe("Ada Reporter gave you a high-priority task: Check quote");
    expect(describeNotification({ ...base, kind: "appointments", detail: "Interview" })).toBe("Ada Reporter assigned you an appointment: Interview");
    expect(describeNotification({ actor: null, story: null, kind: "publishingFailures", detail: "Public snapshot preparation" })).toBe("Public snapshot preparation failed");
  });

  it("copes with a story or person that can no longer be named", () => {
    expect(describeNotification({ actor: null, story: null, detail: null, kind: "storyReturned" })).toBe("Someone requested changes on a story");
    expect(describeNotification({ actor: null, story: null, detail: null, kind: "readyForReview" })).toBe("A story is ready for your review");
  });

  it("counts the digest and gives future reminders action-first copy", () => {
    const item = { type: "task" as const, title: "Call", storyId: 1, when: "today" };
    expect(describeNotification({ kind: "dueDigest", actor: null, story: null, detail: null, items: [item] })).toBe("1 item is due today or overdue");
    expect(describeNotification({ kind: "dueDigest", actor: null, story: null, detail: null, items: [item, item] })).toBe("2 items are due today or overdue");
    expect(describeNotification({
      kind: "dueDigest", actor: null, story: "Budget vote", detail: "Verify figures",
      reminder: { type: "deadline", target: "task", when: "tomorrow" }
    })).toBe("“Verify figures” is due tomorrow");
    expect(describeNotification({
      kind: "appointments", actor: null, story: "Budget vote", detail: "Interview the mayor",
      reminder: { type: "appointment", target: "appointment", when: "in 37 minutes" }
    })).toBe("“Interview the mayor” starts in 37 minutes");
  });

  it("normalizes reminder metadata before it becomes notification copy", () => {
    expect(reminderFacts({ reminder: { type: "deadline", target: "story", when: "tomorrow" } })).toEqual({ type: "deadline", target: "story", when: "tomorrow" });
    expect(reminderFacts({ reminder: { type: "appointment", target: "appointment", when: "in 37 minutes" } })).toEqual({ type: "appointment", target: "appointment", when: "in 37 minutes" });
    expect(reminderFacts({ reminder: { type: "deadline", target: "story", when: "<script>" } })).toBeNull();
    expect(reminderFacts("nope")).toBeNull();
  });
});

describe("notification email", () => {
  it("carries a link and escapes everything it was given", () => {
    const message = notificationEmail({ kind: "highPriorityTasks", actor: "<b>Eve</b>", story: "Budget", detail: "A & B" }, "https://newsroom.example.test/admin/collections/stories/4?x=1&y=2");
    expect(message.subject).toBe("<b>Eve</b> gave you a high-priority task: A & B");
    expect(message.text).toContain("Open in Byline: https://newsroom.example.test/admin/collections/stories/4?x=1&y=2");
    expect(message.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(message.html).toContain("A &amp; B");
    expect(message.html).toContain('href="https://newsroom.example.test/admin/collections/stories/4?x=1&amp;y=2"');
    expect(message.html).toContain('role="presentation"');
    expect(message.html).toContain("background:#6f1d35");
    expect(message.html).toContain(">BYLINE<");
    expect(message.html).toContain("Open in Byline&nbsp;→");
    expect(message.html).not.toContain("<b>Eve");
  });

  it("lists digest items in both fallbacks and the styled card", () => {
    const message = notificationEmail({ kind: "dueDigest", actor: null, story: null, detail: null, items: [{ type: "task", title: "Overdue call", storyId: 3, when: "overdue" }, { type: "deadline", title: "Budget vote", storyId: 4, when: "today" }] }, "https://x.test/admin");
    expect(message.text).toContain("- Task: Overdue call (overdue)");
    expect(message.text).toContain("- Story deadline: Budget vote (today)");
    expect(message.html).toContain("Overdue call");
    expect(message.html).toContain("Task · overdue");
    expect(message.html).toContain("Morning briefing");
  });

  it("styles a one-off reminder without pretending it is the morning digest", () => {
    const message = notificationEmail({
      kind: "appointments", actor: null, story: "Budget", detail: "Interview",
      reminder: { type: "appointment", target: "appointment", when: "in 1 hour" }
    }, "https://x.test/admin/collections/stories/4");
    expect(message.subject).toBe("“Interview” starts in 1 hour");
    expect(message.html).toContain(">Reminder<");
    expect(message.html).not.toContain("Morning briefing");
    expect(message.text).toContain("Open in Byline:");
  });
});

describe("relative time", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("is brief and rounds down", () => {
    expect(relativeTime("2026-11-09T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-11-09T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-11-09T09:00:00Z", now)).toBe("3 h ago");
  });
});
