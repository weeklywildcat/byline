import { describe, expect, it } from "vitest";
import { managesStory, storyRelationship } from "../src/access/story-context";
import { atLeast, newsroomUser, relationIds } from "../src/access/user";
import { passwordSignInAllowed } from "../src/collections/Users";
import { validResourceUrl } from "../src/collections/StoryPlans";
import { addDays, localDay, localToInstant } from "../src/domain/dates";
import { administrationFor, navigationFor } from "../src/domain/navigation";
import { dateOnly, normalizeAppointmentTiming, TimingError } from "../src/domain/schedule";
import { isSlug, slugify } from "../src/domain/slug";
import { CORRECTION_TYPES, STORY_FORMATS, WORKFLOW_STAGES } from "../src/domain/vocabulary";
import { effectiveWorkflow, workflowLabel } from "../src/domain/workflow";

const staff = { id: 7, role: "staff", enabled: true, linkedPerson: 70, collection: "users" };

describe("accounts", () => {
  it("treats a disabled or unknown account as anonymous", () => {
    expect(newsroomUser(staff)).toEqual({ id: 7, role: "staff", linkedPerson: 70 });
    expect(newsroomUser({ ...staff, enabled: false })).toBeNull();
    expect(newsroomUser({ ...staff, role: "owner" })).toBeNull();
    expect(newsroomUser({ ...staff, collection: "people" })).toBeNull();
    expect(newsroomUser(null)).toBeNull();
  });

  it("ranks roles", () => {
    expect(atLeast(newsroomUser(staff), "editor")).toBe(false);
    expect(atLeast(newsroomUser({ ...staff, role: "editor" }), "editor")).toBe(true);
    expect(atLeast(newsroomUser({ ...staff, role: "administrator" }), "editor")).toBe(true);
  });

  it("limits password sign-in to break-glass administrators once Google is configured", () => {
    expect(passwordSignInAllowed({ role: "staff" }, false)).toBe(true);
    expect(passwordSignInAllowed({ role: "staff" }, true)).toBe(false);
    expect(passwordSignInAllowed({ role: "administrator" }, true)).toBe(false);
    expect(passwordSignInAllowed({ role: "administrator", breakGlass: true }, true)).toBe(true);
    expect(passwordSignInAllowed({ role: "editor", breakGlass: true }, true)).toBe(false);
  });
});

describe("story context (byline_story_context)", () => {
  const user = newsroomUser(staff);

  it("makes creators, assigned editors and contributors managers", () => {
    expect(managesStory(user, { createdBy: 7 })).toBe(true);
    expect(managesStory(user, { editor: { id: 7 } })).toBe(true);
    expect(managesStory(user, { contributors: [3, { id: 70 }] })).toBe(true);
    expect(managesStory(user, { createdBy: 1, editor: 2, contributors: [3] })).toBe(false);
  });

  it("makes every editor a manager", () => {
    expect(managesStory(newsroomUser({ ...staff, role: "editor" }), { createdBy: 1 })).toBe(true);
  });

  it("separates participants from unrelated staff", () => {
    expect(storyRelationship(user, { createdBy: 1 }, true)).toBe("participant");
    expect(storyRelationship(user, { createdBy: 1 }, false)).toBe("none");
    expect(storyRelationship(user, { createdBy: 7 }, true)).toBe("manager");
    expect(storyRelationship(null, { createdBy: 7 }, true)).toBe("none");
  });

  it("does not grant contributor access to an account with no linked person", () => {
    expect(managesStory(newsroomUser({ ...staff, linkedPerson: null }), { contributors: [70] })).toBe(false);
  });

  it("reads relationship IDs from values or documents", () => {
    expect(relationIds([1, { id: 2 }, null, "3"])).toEqual([1, 2, "3"]);
  });
});

describe("workflow", () => {
  it("keeps the vocabulary and never stores Published", () => {
    expect(WORKFLOW_STAGES).toEqual(["pitch", "assigned", "reporting", "writing", "editing", "ready", "on-hold", "dropped"]);
    expect((WORKFLOW_STAGES as readonly string[]).includes("published")).toBe(false);
  });

  it("derives Published from publication state and recovers the stored stage", () => {
    expect(effectiveWorkflow("editing", "published")).toBe("published");
    expect(effectiveWorkflow("editing", "draft")).toBe("editing");
    expect(effectiveWorkflow(undefined, "draft")).toBe("pitch");
    expect(workflowLabel("ready")).toBe("Ready for Review");
  });

  it("keeps formats tiny and live out of them", () => {
    expect(STORY_FORMATS).toEqual(["standard", "video", "audio"]);
    expect(CORRECTION_TYPES).toContain("editor-note");
  });
});

describe("appointment timing", () => {
  it("keeps a target window date-only and drops exact times", () => {
    expect(normalizeAppointmentTiming({ scheduleMode: "window", windowStart: "2026-11-09", windowEnd: "2026-11-13", startAt: "2026-11-09T14:00:00Z" })).toEqual({
      scheduleMode: "window",
      windowStart: "2026-11-09",
      windowEnd: "2026-11-13",
      startAt: null,
      endAt: null
    });
  });

  it("keeps an exact time as a UTC instant and drops the window", () => {
    expect(normalizeAppointmentTiming({ scheduleMode: "exact", startAt: "2026-11-10T10:15:00-05:00", windowStart: "2026-11-09" })).toEqual({
      scheduleMode: "exact",
      windowStart: null,
      windowEnd: null,
      startAt: "2026-11-10T15:15:00.000Z",
      endAt: null
    });
  });

  it("clears every timing field when unscheduled", () => {
    expect(normalizeAppointmentTiming({ scheduleMode: "unscheduled", startAt: "2026-11-10T10:15:00Z", windowStart: "2026-11-09" })).toEqual({
      scheduleMode: "unscheduled",
      windowStart: null,
      windowEnd: null,
      startAt: null,
      endAt: null
    });
  });

  it("refuses ends before starts, missing starts, fake dates and zoneless times", () => {
    expect(() => normalizeAppointmentTiming({ scheduleMode: "window", windowStart: "2026-11-13", windowEnd: "2026-11-09" })).toThrow(TimingError);
    expect(() => normalizeAppointmentTiming({ scheduleMode: "window" })).toThrow("first day");
    expect(() => normalizeAppointmentTiming({ scheduleMode: "exact", startAt: "2026-11-10T10:00:00Z", endAt: "2026-11-10T09:00:00Z" })).toThrow(TimingError);
    expect(() => normalizeAppointmentTiming({ scheduleMode: "exact", startAt: "2026-11-10T10:00" })).toThrow("timezone");
    expect(() => dateOnly("2026-02-30")).toThrow("does not exist");
    expect(() => normalizeAppointmentTiming({ scheduleMode: "soon" })).toThrow(TimingError);
  });
});

describe("dates", () => {
  it("reads the calendar day in the newsroom timezone, not UTC", () => {
    expect(localDay("2026-11-06T03:30:00Z", "America/New_York")).toBe("2026-11-05");
    expect(localDay("2026-11-06T03:30:00Z", "UTC")).toBe("2026-11-06");
  });

  it("reads the screens' offset-free times in the newsroom timezone, across DST", () => {
    expect(localToInstant("2026-11-10T17:00", "America/New_York")).toBe("2026-11-10T22:00:00.000Z");
    expect(localToInstant("2026-07-10T17:00", "America/New_York")).toBe("2026-07-10T21:00:00.000Z");
    // 1:30 AM happens twice on 2026-11-01; either answer is a real time, never a shifted day.
    expect(localToInstant("2026-11-01T01:30", "America/New_York")).toMatch(/^2026-11-01T0[56]:30:00.000Z$/);
    expect(localToInstant("2026-11-10T17:00:00Z", "America/New_York")).toBe("2026-11-10T17:00:00.000Z");
    expect(() => localToInstant("next tuesday", "America/New_York")).toThrow();
  });

  it("moves date-only values across month ends and DST without a timezone", () => {
    expect(addDays("2026-10-31", 3)).toBe("2026-11-03");
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
  });
});

describe("navigation", () => {
  it("offers only Byline destinations that exist, to every role", () => {
    for (const role of ["staff", "editor", "administrator"] as const) {
      expect(navigationFor(role).every((item) => !item.path.startsWith("/collections/"))).toBe(true);
    }
    expect(navigationFor("staff").map((item) => item.key)).toEqual(["home"]);
  });

  it("keeps raw Payload screens in an administrators-only section", () => {
    expect(administrationFor("staff")).toEqual([]);
    expect(administrationFor("editor")).toEqual([]);
    expect(administrationFor("administrator").map((item) => item.key)).toContain("raw-stories");
  });
});

describe("slugs and links", () => {
  it("slugifies headlines", () => {
    expect(slugify("Wildcats Win State — Again!")).toBe("wildcats-win-state-again");
    expect(slugify("Café’s Menu")).toBe("cafes-menu");
    expect(isSlug("wildcats-win")).toBe(true);
    expect(isSlug("Wildcats Win")).toBe(false);
  });

  it("refuses links with credentials, other schemes or whitespace", () => {
    expect(validResourceUrl("https://docs.google.com/document/d/abc")).toBe(true);
    expect(validResourceUrl("https://user:pass@example.com/")).not.toBe(true);
    expect(validResourceUrl("javascript:alert(1)")).not.toBe(true);
    expect(validResourceUrl("https://example.com/a b")).not.toBe(true);
  });
});
