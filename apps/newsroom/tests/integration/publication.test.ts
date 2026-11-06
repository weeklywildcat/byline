import { planningCalendarEvents, sanitizePlanningFilters, type PlanningFilters, type PlanningResponse } from "@byline/newsroom-screens/planning/planning-model";
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planningResponse } from "../../src/newsroom/planning";
import { homeBootstrap, screenContext, storyWorkspace } from "../../src/newsroom/screen-models";
import { scheduledPublicationsForStories } from "../../src/newsroom/scheduled-publication";
import type { User } from "../../src/payload-types";

/**
 * Publication state in the newsroom read models. Payload keeps scheduled
 * publishing as `schedulePublish` jobs in `payload-jobs`; Byline adds no field
 * for it. These tests queue jobs exactly as Payload's Schedule drawer does
 * (`payload.jobs.queue`), never a fake `scheduledAt` on a story.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};
const TZ = "America/New_York";
const NOW = new Date("2026-11-09T15:00:00Z");
const SOON = "2026-11-12T15:00:00.000Z";
const LATER = "2026-11-14T15:00:00.000Z";
const LATEST = "2026-11-20T15:00:00.000Z";
const PAST = "2026-11-02T15:00:00.000Z";

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `publication-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `publication-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}

const reqAs = (key: string, extra: Partial<PayloadRequest> = {}) => createLocalReq({ user: accounts[key], req: extra }, payload);
const ctxAs = async (key: string) => screenContext(await reqAs(key), TZ, NOW);
const planning = async (key: string, filters: Partial<PlanningFilters> = {}) => planningResponse(await ctxAs(key), sanitizePlanningFilters(filters));
const row = (response: PlanningResponse, key: string) => response.stories.find((item) => item.id === story[key])!;
const ids = (...keys: string[]) => keys.map((key) => story[key]).sort();
const matching = (response: PlanningResponse) => response.stories.map((item) => item.id).sort();

async function create(key: string, headline: string, extra: Record<string, unknown> = {}) {
  return (await payload.create({ collection: "stories", draft: true, data: { headline, ...extra }, req: await reqAs(key), overrideAccess: false })).id;
}

/** A job exactly as Payload's Schedule drawer queues it (the id is a string in `input.doc.value`). */
async function schedule(storyKey: string, waitUntil: string, type: "publish" | "unpublish" = "publish", relationTo: "stories" | "pages" = "stories", by = "editor") {
  return payload.jobs.queue({
    task: "schedulePublish",
    waitUntil: new Date(waitUntil),
    input: {
      type,
      // Payload's generated type says number; the stored value is always a string (payload#10481).
      doc: { relationTo, value: String(story[storyKey]) as unknown as number },
      user: { relationTo: "users", value: accounts[by].id }
    }
  });
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_publication`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("alice", "staff");
  await account("bob", "staff");
  await account("photo", "staff", false);

  const publish = async (headline: string) => (await payload.create({ collection: "stories", data: { headline, _status: "published" } as never, req: await reqAs("editor"), overrideAccess: false })).id;

  story.draft = await create("alice", "Plain draft", { contributors: [people.alice] });
  story.scheduled = await create("alice", "Scheduled for Thursday", { contributors: [people.alice] });
  story.past = await create("alice", "Schedule that already passed", { contributors: [people.alice] });
  story.otherCollection = await create("alice", "Same id, different collection", { contributors: [people.alice] });
  story.multiple = await create("alice", "Two schedules", { contributors: [people.alice] });
  story.unpublishOnly = await create("alice", "Only an unpublish is queued", { contributors: [people.alice] });
  story.private = await create("editor", "Editor's private scheduled draft");
  story.published = await publish("Already published");
  story.rewrite = await publish("Library hours change");
  await payload.update({ collection: "stories", id: story.rewrite, draft: true, data: { headline: "Library to close (embargoed)" }, req: await reqAs("editor"), overrideAccess: false });
  story.unpublishing = await publish("Published, to be taken down");
  await payload.create({ collection: "production-assignments", data: { story: story.rewrite, title: "Library photos", type: "photo", status: "assigned", assignees: [accounts.photo.id] }, req: await reqAs("editor"), overrideAccess: false });

  // Jobs last: publishing or editing a document clears its upcoming schedule.
  await schedule("scheduled", SOON);
  await schedule("past", PAST);
  await schedule("otherCollection", SOON, "publish", "pages");
  await schedule("multiple", LATEST);
  await schedule("multiple", LATER);
  await schedule("multiple", SOON, "unpublish");
  await schedule("unpublishOnly", SOON, "unpublish");
  await schedule("private", SOON);
  await schedule("rewrite", SOON);
  await schedule("unpublishing", SOON, "unpublish");
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("publication state in the Stories read model", () => {
  it("keeps draft, scheduled and published apart, in that precedence", async () => {
    const response = await planning("editor");
    expect(row(response, "draft").publicationState).toMatchObject({ id: "draft", label: "Draft", isPublished: false, isScheduled: false, scheduledAt: null });
    expect(row(response, "scheduled").publicationState).toEqual({ id: "scheduled", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: SOON, publishedAt: null });
    expect(row(response, "published").publicationState).toMatchObject({ id: "published", label: "Published", isPublished: true, isScheduled: false, scheduledAt: null });
  });

  it("is independent of the newsroom workflow", async () => {
    const found = row(await planning("editor"), "scheduled");
    expect(found.workflow.id).toBe("pitch");
    expect(found.publicationState.id).toBe("scheduled");
  });

  it("ignores a schedule that has passed", async () => expect(row(await planning("editor"), "past").publicationState).toMatchObject({ id: "draft", scheduledAt: null }));

  it("ignores a schedule queued for another collection, even with the same id", async () => {
    expect(row(await planning("editor"), "otherCollection").publicationState).toMatchObject({ id: "draft", scheduledAt: null });
  });

  it("does not treat a future unpublish as a scheduled publication", async () => {
    const response = await planning("editor");
    expect(row(response, "unpublishOnly").publicationState).toMatchObject({ id: "draft", scheduledAt: null });
    // The story is live until the unpublish actually runs.
    expect(row(response, "unpublishing").publicationState).toMatchObject({ id: "published", isPublished: true, isScheduled: false, scheduledAt: null });
  });

  it("uses the earliest upcoming publish when there are several, whatever else is queued", async () => {
    expect(row(await planning("editor"), "multiple").publicationState).toMatchObject({ id: "scheduled", scheduledAt: LATER });
  });

  it("keeps a published story with a newer rewrite published, for managers and for participants", async () => {
    for (const key of ["editor", "photo"]) {
      expect(row(await planning(key), "rewrite").publicationState).toMatchObject({ id: "published", isPublished: true, isScheduled: false, scheduledAt: null });
    }
    expect(row(await planning("editor"), "rewrite").title).toBe("Library to close (embargoed)");
    expect(row(await planning("photo"), "rewrite").title).toBe("Library hours change");
  });
});

describe("scheduled publication access", () => {
  it("never reaches someone who cannot read the story", async () => {
    for (const key of ["alice", "bob", "photo"]) {
      const response = await planning(key);
      expect(matching(response)).not.toContain(story.private);
      expect(JSON.stringify(response)).not.toContain("Editor's private scheduled draft");
    }
    expect(row(await planning("editor"), "private").publicationState).toMatchObject({ id: "scheduled", scheduledAt: SOON });
    expect((await planning("bob")).stories).toEqual([]);
    // A participant on a published story with a scheduled rewrite learns nothing about the schedule.
    expect(JSON.stringify(await planning("photo"))).not.toContain(SOON);
  });

  it("looks up only the ids it is given and returns nothing but id → instant", async () => {
    const ctx = await ctxAs("editor");
    const found = await scheduledPublicationsForStories(ctx, [story.scheduled, story.multiple, story.draft, story.past]);
    expect([...found.entries()].sort()).toEqual([[story.scheduled, SOON], [story.multiple, LATER]].sort());
    expect(found.has(story.private)).toBe(false);
    expect(await scheduledPublicationsForStories(ctx, [])).toEqual(new Map());
  });

  it("is one read for the whole collection, not one per story", async () => {
    const ctx = await ctxAs("editor");
    const original = payload.db.find;
    let jobReads = 0;
    payload.db.find = ((args: { collection: string }) => {
      if (args.collection === "payload-jobs") jobReads += 1;
      return original.call(payload.db, args as never);
    }) as typeof payload.db.find;
    try {
      await planningResponse(ctx, sanitizePlanningFilters({}));
    } finally {
      payload.db.find = original;
    }
    expect(jobReads).toBe(1);
  });

  it("is read by Home and the Story workspace the same way", async () => {
    const home = await homeBootstrap(await ctxAs("alice"));
    expect(home.stories.find((item) => item.id === story.scheduled)?.publicationState).toMatchObject({ id: "scheduled", scheduledAt: SOON });
    const workspace = await storyWorkspace(await ctxAs("alice"), story.multiple);
    expect(workspace.story.publicationState).toMatchObject({ id: "scheduled", scheduledAt: LATER });
  });
});

describe("Stories filters and Calendar", () => {
  it("filters on publication state, Scheduled included", async () => {
    expect(matching(await planning("editor", { publicationState: "scheduled" }))).toEqual(ids("scheduled", "multiple", "private"));
    expect(matching(await planning("editor", { publicationState: "published" }))).toEqual(ids("published", "rewrite", "unpublishing"));
    expect(matching(await planning("editor", { publicationState: "draft" }))).toEqual(ids("draft", "past", "otherCollection", "unpublishOnly"));
    expect(matching(await planning("alice", { publicationState: "scheduled" }))).toEqual(ids("scheduled", "multiple"));
  });

  it("puts a scheduled story on the Calendar as Scheduled publication, with no Payload special case", async () => {
    const events = planningCalendarEvents((await planning("editor")).stories, TZ).filter((event) => event.type === "scheduled");
    expect(events.map((event) => [event.storyId, event.label]).sort()).toEqual([story.scheduled, story.multiple, story.private].sort().map((id) => [id, "Scheduled publication"]));
    expect(events.find((event) => event.storyId === story.multiple)?.date).toBe("2026-11-14");
  });
});
