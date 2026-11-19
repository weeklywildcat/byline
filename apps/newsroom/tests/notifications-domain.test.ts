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
  const brand = { name: "Weekly Wildcat", homeUrl: "https://newsroom.example.test/admin", logo: { light: "https://newsroom.example.test/email/wordmark.png", dark: "https://newsroom.example.test/email/wordmark-dark.png", width: 240, height: 28 }, siteUrl: "https://weeklywildcat.example.test", organization: "Ninety Six High School", fontUrl: "https://newsroom.example.test/fonts/mona-sans-latin.woff2" };

  it("carries a link and escapes everything it was given", () => {
    const message = notificationEmail({ kind: "highPriorityTasks", actor: "<b>Eve</b>", story: "Budget", detail: "A & B" }, "https://newsroom.example.test/admin/collections/stories/4?x=1&y=2");
    expect(message.subject).toBe("<b>Eve</b> gave you a high-priority task: A & B");
    expect(message.text).toContain("Open the task: https://newsroom.example.test/admin/collections/stories/4?x=1&y=2");
    expect(message.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(message.html).toContain("A &amp; B");
    expect(message.html).toContain('href="https://newsroom.example.test/admin/collections/stories/4?x=1&amp;y=2"');
    expect(message.html).toContain('role="presentation"');
    expect(message.html).not.toContain("<b>Eve");
  });

  it("uses the publication's masthead, says what to do next and why it was sent", () => {
    const message = notificationEmail({ kind: "readyForReview", actor: "Ada", story: "Budget vote delayed", detail: "copy" }, "https://newsroom.example.test/admin/collections/stories/4", { brand, settingsHref: "https://newsroom.example.test/admin?notifications=settings", dateline: "Thursday, November 19" });
    expect(message.html).toContain('src="https://newsroom.example.test/email/wordmark.png"');
    expect(message.html).toContain('alt="Weekly Wildcat"');
    expect(message.html).toContain('src: url("https://newsroom.example.test/fonts/mona-sans-latin.woff2")');
    expect(message.html).toContain("font-family:'Mona Sans',sans-serif;");
    expect(message.html).toContain("Thursday, November 19");
    expect(message.html).toContain("Review the story&nbsp;&rarr;");
    expect(message.html).toContain("approve it or send it back");
    expect(message.html).toContain("Ninety Six High School");
    expect(message.html).not.toMatch(/Arial|Helvetica|Georgia|Times|[^-]serif[;"]/);
    expect(message.text).not.toContain("Story: Budget vote delayed");
    expect(message.text).toContain("“Reviews” emails are on");
    expect(message.text).toContain("Change what you get: https://newsroom.example.test/admin?notifications=settings");
  });

  it("falls back to the name in type without a logo address", () => {
    const message = notificationEmail({ kind: "transcriptReady", actor: null, story: null, detail: "Interview 1" }, "https://x.test/admin");
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain(">Weekly Wildcat</span>");
    expect(message.html).toContain("Read the transcript");
  });

  it("splits the digest into overdue and today, each linked to its story", () => {
    const message = notificationEmail(
      { kind: "dueDigest", actor: null, story: null, detail: null, items: [{ type: "task", title: "Overdue call", storyId: 3, when: "overdue" }, { type: "deadline", title: "Budget vote", storyId: 4, when: "today" }, { type: "appointment", title: "Coach interview", storyId: null, when: "today" }] },
      "https://x.test/admin",
      { storyHref: (id) => `https://x.test/admin/collections/stories/${id}` }
    );
    expect(message.subject).toBe("3 items are due today or overdue");
    expect(message.text).toContain("OVERDUE (1)\n- Overdue call — Task · Overdue\n  https://x.test/admin/collections/stories/3");
    expect(message.text).toContain("DUE TODAY (2)");
    expect(message.text).toContain("- Coach interview — Appointment · Due today");
    expect(message.html).toContain('href="https://x.test/admin/collections/stories/4"');
    expect(message.html).toContain("Morning briefing");
    expect(message.html).toContain("1 overdue, 2 due today.");
  });

  it("styles a one-off reminder without pretending it is the morning digest", () => {
    const message = notificationEmail({
      kind: "appointments", actor: null, story: "Budget", detail: "Interview",
      reminder: { type: "appointment", target: "appointment", when: "in 1 hour" }
    }, "https://x.test/admin/collections/stories/4");
    expect(message.subject).toBe("“Interview” starts in 1 hour");
    expect(message.html).toContain(">Reminder<");
    expect(message.html).not.toContain("Morning briefing");
    expect(message.text).toContain("Story: Budget");
    expect(message.text).toContain("See the details: https://x.test/admin/collections/stories/4");
  });

  it("marks failures as needing attention", () => {
    const message = notificationEmail({ kind: "frontPageFailures", actor: null, story: null, detail: "Story 9 is unpublished" }, "https://x.test/admin/front-page");
    expect(message.html).toContain("&#9679;&nbsp;Attention needed");
    expect(message.text).not.toContain("Problem:");
    expect(message.text).toContain("Open Front Page: https://x.test/admin/front-page");
  });

  it("adds the story when the headline names only the work", () => {
    const message = notificationEmail({ kind: "dueDigest", actor: null, story: "Budget vote delayed", detail: "Call the clerk", reminder: { type: "deadline", target: "task", when: "tomorrow" } }, "https://x.test/admin");
    expect(message.subject).toBe("“Call the clerk” is due tomorrow");
    expect(message.text).toContain("Story: Budget vote delayed");
    expect(message.html).toContain(">Deadline<");
  });

  it("has copy for every kind", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const message = notificationEmail({ kind, actor: "Ada", story: "Budget", detail: "x", items: [] }, "https://x.test/admin");
      expect(message.html).toContain("&rarr;");
      expect(message.text).toContain("https://x.test/admin");
    }
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
