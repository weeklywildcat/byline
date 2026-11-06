import { sql } from "drizzle-orm";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pollVotes } from "../../src/db/poll-votes";
import { advanceIdSequences } from "../../src/import/sequences";
import type { User } from "../../src/payload-types";

let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
let storyId: number;

async function account(key: string, role: User["role"], options: { person?: boolean; enabled?: boolean } = {}) {
  if (options.person) {
    const person = await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `${key}-person`, status: "active" } });
    people[key] = person.id;
  }
  const user = await payload.create({
    collection: "users",
    data: { email: `${key}@example.test`, password: `pw-${key}-123456`, name: key, role, enabled: options.enabled ?? true, linkedPerson: people[key] ?? null }
  });
  accounts[key] = { ...user, collection: "users" } as User;
}

const as = (key: string) => ({ user: accounts[key], overrideAccess: false as const });

beforeAll(async () => {
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("admin", "administrator");
  await account("editor", "editor", { person: true });
  await account("alice", "staff", { person: true });
  await account("bob", "staff", { person: true });
  await account("carol", "staff");
  await account("erin", "staff", { person: true });
  await account("dave", "staff", { enabled: false });
});

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("stories and their plans", () => {
  it("creates a plan with the story, owned by its creator, at Pitch", async () => {
    const story = await payload.create({ collection: "stories", data: { headline: "Budget vote", contributors: [people.alice] }, draft: true, ...as("alice") });
    storyId = story.id;
    const plans = await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, overrideAccess: true });
    expect(plans.docs).toHaveLength(1);
    expect(plans.docs[0].workflow).toBe("pitch");
    expect(plans.docs[0].createdBy).toMatchObject({ id: accounts.alice.id });
    expect(story.slug).toBe("budget-vote");
    expect(story.contentFormat).toBe("byline-v1");
  });

  it("hides a draft and its plan from unrelated staff and refuses their edits", async () => {
    const found = await payload.find({ collection: "stories", where: { id: { equals: storyId } }, draft: true, ...as("bob") });
    expect(found.docs).toHaveLength(0);
    await expect(payload.findByID({ collection: "stories", id: storyId, draft: true, ...as("bob") })).rejects.toThrow();
    const plans = await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, ...as("bob") });
    expect(plans.docs).toHaveLength(0);
    await expect(payload.update({ collection: "stories", id: storyId, data: { headline: "Hijacked" }, draft: true, ...as("bob") })).rejects.toThrow();
  });

  it("lets a manager move workflow but not set the editor or deadline", async () => {
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, overrideAccess: true })).docs[0];
    await payload.update({ collection: "story-plans", id: plan.id, data: { workflow: "writing", deadline: "2026-11-12", editor: accounts.editor.id }, ...as("alice") });
    const after = await payload.findByID({ collection: "story-plans", id: plan.id, depth: 0, overrideAccess: true });
    expect(after.workflow).toBe("writing");
    expect(after.deadline ?? null).toBeNull();
    expect(after.editor ?? null).toBeNull();

    await payload.update({ collection: "story-plans", id: plan.id, data: { deadline: "2026-11-12", editor: accounts.editor.id }, ...as("editor") });
    const edited = await payload.findByID({ collection: "story-plans", id: plan.id, depth: 0, overrideAccess: true });
    expect(edited.deadline).toBe("2026-11-12");
    expect(edited.editor).toBe(accounts.editor.id);
  });

  it("refuses a fabricated deadline timestamp", async () => {
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, overrideAccess: true })).docs[0];
    await expect(payload.update({ collection: "story-plans", id: plan.id, data: { deadline: "2026-11-12T09:00:00Z" }, ...as("editor") })).rejects.toThrow();
  });

  it("never lets staff create a plan directly", async () => {
    await expect(payload.create({ collection: "story-plans", data: { story: storyId, workflow: "pitch" }, ...as("alice") })).rejects.toThrow();
  });

  it("follows the latest draft's contributors for access, without moving workflow", async () => {
    await payload.update({ collection: "stories", id: storyId, data: { contributors: [people.alice, people.bob] }, draft: true, autosave: true, ...as("alice") });
    // Draft saves do not touch the main row, but the plan follows the draft.
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, depth: 0, overrideAccess: true })).docs[0];
    expect(plan.contributors).toEqual([people.alice, people.bob]);
    expect(plan.workflow).toBe("writing");
    const read = await payload.findByID({ collection: "stories", id: storyId, draft: true, ...as("bob") });
    expect(read.headline).toBe("Budget vote");
  });

  it("drops client-chosen IDs but keeps them for the controlled import, then advances sequences", async () => {
    const chosen = await payload.create({ collection: "stories", data: { id: 999_999, headline: "Chosen ID" } as never, draft: true, ...as("alice") });
    expect(chosen.id).not.toBe(999_999);

    const imported = await payload.create({ collection: "stories", data: { id: 5000, headline: "Imported story", legacyWordPressId: 5000 } as never, draft: true, overrideAccess: true, context: { bylineImport: true } });
    expect(imported.id).toBe(5000);
    expect(imported.legacyWordPressId).toBe(5000);

    const advanced = await advanceIdSequences(payload);
    expect(advanced.find((row) => row.table === "stories")?.next).toBe(5001);
    const next = await payload.create({ collection: "stories", data: { headline: "After import" }, draft: true, ...as("alice") });
    expect(next.id).toBe(5001);
  });

  it("shows published stories, but not their plans, to unrelated staff", async () => {
    await payload.update({ collection: "stories", id: storyId, data: { _status: "published", section: null }, ...as("editor") });
    const read = await payload.findByID({ collection: "stories", id: storyId, ...as("erin") });
    expect(read.publishedAt).toBeTruthy();
    const plans = await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, ...as("erin") });
    expect(plans.docs).toHaveLength(0);
  });
});

describe("a published story with newer draft changes", () => {
  it("keeps the unpublished changes from unrelated staff", async () => {
    await payload.update({ collection: "stories", id: storyId, data: { headline: "Unpublished rewrite" }, draft: true, ...as("alice") });
    const published = await payload.findByID({ collection: "stories", id: storyId, ...as("erin") });
    expect(published.headline).toBe("Budget vote");
    const asked = await payload.findByID({ collection: "stories", id: storyId, draft: true, ...as("erin") }).catch(() => null);
    expect(asked?.headline ?? "Budget vote").toBe("Budget vote");
    // The team sees the draft.
    const team = await payload.findByID({ collection: "stories", id: storyId, draft: true, ...as("bob") });
    expect(team.headline).toBe("Unpublished rewrite");
  });
});

describe("participants with assigned work", () => {
  let assignmentId: number;
  let aliceTaskId: number;

  beforeAll(async () => {
    const assignment = await payload.create({ collection: "production-assignments", data: { story: storyId, type: "photo", status: "needed", title: "Portrait of the board", assignees: [accounts.carol.id] }, ...as("editor") });
    assignmentId = assignment.id;
    const task = await payload.create({ collection: "tasks", data: { story: storyId, title: "Call the clerk", assignees: [accounts.alice.id] }, ...as("alice") });
    aliceTaskId = task.id;
  });

  it("see the story's plan and their own work, not other people's", async () => {
    const plans = await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, ...as("carol") });
    expect(plans.docs).toHaveLength(1);
    const tasks = await payload.find({ collection: "tasks", where: { story: { equals: storyId } }, ...as("carol") });
    expect(tasks.docs.map((task) => task.id)).not.toContain(aliceTaskId);
    const work = await payload.find({ collection: "production-assignments", where: { story: { equals: storyId } }, ...as("carol") });
    expect(work.docs.map((row) => row.id)).toEqual([assignmentId]);
  });

  it("update the status of their assignment but not what was asked for", async () => {
    await payload.update({ collection: "production-assignments", id: assignmentId, data: { status: "in-progress", title: "Something else" }, ...as("carol") });
    const row = await payload.findByID({ collection: "production-assignments", id: assignmentId, overrideAccess: true });
    expect(row.status).toBe("in-progress");
    expect(row.title).toBe("Portrait of the board");
  });

  it("cannot edit article copy or the plan", async () => {
    await expect(payload.update({ collection: "stories", id: storyId, data: { headline: "Photographer's headline" }, draft: true, ...as("carol") })).rejects.toThrow();
    const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, overrideAccess: true })).docs[0];
    await expect(payload.update({ collection: "story-plans", id: plan.id, data: { brief: "Mine now" }, ...as("carol") })).rejects.toThrow();
  });

  it("create appointments only for themselves", async () => {
    const mine = await payload.create({ collection: "appointments", data: { story: storyId, title: "Shoot the board", kind: "photo", status: "planned", scheduleMode: "window", windowStart: "2026-11-09", startAt: "2026-11-09T14:00:00.000Z", assignees: [accounts.carol.id] }, ...as("carol") });
    expect(mine.windowStart).toBe("2026-11-09");
    expect(mine.startAt ?? null).toBeNull();
    await expect(payload.create({ collection: "appointments", data: { story: storyId, title: "For Alice", kind: "interview", status: "planned", scheduleMode: "unscheduled", assignees: [accounts.alice.id] }, ...as("carol") })).rejects.toThrow("only to yourself");
  });

  it("are refused on stories they have no work on", async () => {
    const other = await payload.create({ collection: "stories", data: { headline: "Unrelated draft" }, draft: true, ...as("alice") });
    await expect(payload.create({ collection: "appointments", data: { story: other.id, title: "Sneak in", kind: "other", status: "planned", scheduleMode: "unscheduled", assignees: [accounts.carol.id] }, ...as("carol") })).rejects.toThrow();
  });
});

describe("accounts and anonymous access", () => {
  it("makes the first account the break-glass administrator", async () => {
    const first = await payload.findByID({ collection: "users", id: accounts.admin.id, overrideAccess: true });
    expect(first).toMatchObject({ role: "administrator", enabled: true, breakGlass: true });
    // Later accounts keep the role they were given.
    const editor = await payload.findByID({ collection: "users", id: accounts.editor.id, overrideAccess: true });
    expect(editor).toMatchObject({ role: "editor", breakGlass: false });
  });

  it("treats a disabled account as signed out", async () => {
    await expect(payload.find({ collection: "stories", ...as("dave") })).rejects.toThrow();
    await expect(payload.login({ collection: "users", data: { email: "dave@example.test", password: "pw-dave-123456" } })).rejects.toThrow();
  });

  it("serves nothing to anonymous requests, media included", async () => {
    for (const collection of ["stories", "story-plans", "media", "people", "tasks", "polls"] as const) {
      await expect(payload.find({ collection, overrideAccess: false })).rejects.toThrow();
    }
  });

  it("keeps at least one enabled administrator", async () => {
    await expect(payload.update({ collection: "users", id: accounts.admin.id, data: { role: "staff" }, ...as("admin") })).rejects.toThrow("at least one enabled administrator");
  });

  it("does not let staff promote themselves", async () => {
    await payload.update({ collection: "users", id: accounts.alice.id, data: { role: "administrator" }, ...as("alice") });
    const alice = await payload.findByID({ collection: "users", id: accounts.alice.id, overrideAccess: true });
    expect(alice.role).toBe("staff");
  });
});

describe("poll votes", () => {
  it("are a dedicated table with one vote per poll and voter, not a collection", async () => {
    expect(Object.keys(payload.collections)).not.toContain("byline_poll_votes");
    const db = (payload.db as unknown as { drizzle: { insert: Function; execute: Function } }).drizzle;
    await db.insert(pollVotes).values({ pollId: "lunch", optionId: "pizza", voterKey: "k1" });
    await expect(db.insert(pollVotes).values({ pollId: "lunch", optionId: "tacos", voterKey: "k1" })).rejects.toThrow();
    const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM byline_poll_votes`);
    expect(rows[0].n).toBe(1);
  });
});
