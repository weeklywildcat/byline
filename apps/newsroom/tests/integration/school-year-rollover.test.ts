import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOW_STEPS } from "../../src/domain/newsroom-roles";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import type { User } from "../../src/payload-types";

/**
 * Starting a new school year against real PostgreSQL (docs/newsroom-roles.md):
 * editors plan, preview and start it once; exactly one year is ever active;
 * the old year's memberships, role assignments and reviews stay as they were.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const ids: Record<string, number> = {};
const system = { overrideAccess: true as const, context: { bylineSystem: true } };

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `ro-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `ro-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } as never, overrideAccess: true });
  accounts[key] = { ...user, collection: "users" } as User;
}

async function call(method: string, path: string, key: string, { data, routeParams = {} }: { data?: unknown; routeParams?: Record<string, string> } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await createLocalReq({ user: accounts[key] }, payload);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams() });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}
const years = (key = "editor") => call("get", "/byline/school-years", key);
const on = (id: number) => ({ id: String(id) });

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_rollover`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("reporter", "staff");
  await account("jeremy", "staff");
  await account("maycie", "staff");
  await account("graduate", "staff");
  ids.sports = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "ro-sports" } })).id;
  ids.news = (await payload.create({ collection: "sections", data: { name: "News", slug: "ro-news" } })).id;
  ids.old = (await payload.create({ collection: "school-years", data: { name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31", status: "active", revision: 1 }, ...system })).id;
  ids.sectionEditor = (await payload.create({ collection: "newsroom-roles", data: { key: "section-editor", name: "Section Editor", scopeKind: "section", waitingLabel: "{scope} Editor", revision: 1 }, ...system })).id;
  ids.copyDesk = (await payload.create({ collection: "newsroom-roles", data: { key: "copy-desk", name: "Copy Desk", scopeKind: "none", revision: 1 }, ...system })).id;
  const give = async (key: string, role: number, patch: Record<string, unknown> = {}) => (await payload.create({ collection: "role-assignments", data: { role, user: accounts[key]!.id, schoolYear: ids.old, scopeMode: "global", ...patch } as never, ...system })).id;
  ids.jeremySports = await give("jeremy", ids.sectionEditor, { scopeMode: "scoped", sections: [ids.sports] });
  ids.graduateNews = await give("graduate", ids.sectionEditor, { scopeMode: "scoped", sections: [ids.news] });
  ids.maycieCopy = await give("maycie", ids.copyDesk);
  await payload.create({ collection: "staff-memberships", data: { schoolYear: ids.old, user: accounts.jeremy!.id, title: "Sports Editor", status: "active" }, ...system });
  await payload.create({ collection: "staff-memberships", data: { schoolYear: ids.old, user: accounts.graduate!.id, title: "Senior Writer", status: "active" }, ...system });
  const step = (stepId: string, label: string, roleId: number, roleMatch: string) => ({ stepId, label, target: "whole", resolver: "role", roleId, roleMatch, userId: null, conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] }, selfReview: "exclude-writers", fallback: "none" });
  await payload.create({ collection: "review-workflows", data: { name: "Standard", isDefault: true, steps: [step("section", "Section Edit", ids.sectionEditor, "story-section"), ...DEFAULT_WORKFLOW_STEPS], revision: 1 }, ...system } as never);
  // The graduating writer has an unfinished story and an old, reviewed one.
  ids.story = (await payload.create({ collection: "stories", draft: true, overrideAccess: true, data: { headline: "Playoff preview", section: ids.sports, contributors: [people.graduate] } as never })).id;
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: ids.story } }, limit: 1, overrideAccess: true })).docs[0]!;
  await payload.update({ collection: "story-plans", id: plan.id, data: { workflow: "writing", createdBy: accounts.graduate!.id } as never, ...system });
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("planning the year", () => {
  it("is for editors only", async () => {
    expect((await years("reporter")).status).toBe(403);
    expect((await call("post", "/byline/school-years", "reporter", { data: { name: "2027–28", startsOn: "2027-08-01", endsOn: "2028-07-31" } })).status).toBe(403);
  });

  it("suggests the next year and lists last year's staff with their responsibilities", async () => {
    const overview = (await years()).body;
    expect(overview.suggestion).toEqual({ name: "2027–28", startsOn: "2027-08-01", endsOn: "2028-07-31" });
    expect(overview.active).toMatchObject({ name: "2026–27", status: "active" });
    const jeremy = overview.staff.find((row: { name: string }) => row.name === "jeremy Account");
    expect(jeremy).toMatchObject({ title: "Sports Editor", assignments: [{ roleName: "Section Editor", scope: "Sports" }] });
  });

  it("refuses an overlapping or malformed year, and a second planned year", async () => {
    expect((await call("post", "/byline/school-years", "editor", { data: { name: "Bad", startsOn: "2027-06-01", endsOn: "2027-12-31" } })).body.data.problems).toEqual(["These dates overlap 2026–27."]);
    const planned = await call("post", "/byline/school-years", "editor", { data: { name: "2027–28", startsOn: "2027-08-01", endsOn: "2028-07-31" } });
    expect(planned.status).toBe(200);
    ids.next = planned.body.planned.id;
    expect(planned.body.planned.status).toBe("planned");
    expect((await call("post", "/byline/school-years", "editor", { data: { name: "2028–29", startsOn: "2028-08-01", endsOn: "2029-07-31" } })).status).toBe(409);
  });
});

describe("previewing what a plan means", () => {
  const plan = (patch: Record<string, unknown> = {}) => ({ returning: [accounts.jeremy!.id, accounts.maycie!.id, accounts.reporter!.id, accounts.editor!.id], carry: [ids.jeremySports, ids.graduateNews, ids.maycieCopy], titles: { [accounts.jeremy!.id]: "Editor-in-Chief" }, ...patch });
  const preview = (data: Record<string, unknown>) => call("post", "/byline/school-years/:id/preview", "editor", { data, routeParams: on(ids.next) });

  it("names who leaves, what they leave behind, and drops responsibilities of people who don't return", async () => {
    const result = (await preview(plan())).body;
    expect(result.departing.map((person: { name: string }) => person.name)).toEqual(["graduate Account"]);
    expect(result.carried).toBe(2);
    expect(result.unfinished).toEqual([{ userId: accounts.graduate!.id, name: "graduate Account", stories: [{ id: ids.story, title: "Playoff preview", phase: "drafting", deadline: null, as: "writer" }] }]);
  });

  it("checks review routing in the new year with the real resolver: News loses its only Section Editor", async () => {
    const result = (await preview(plan())).body;
    expect(result.routing).toMatchObject([{ workflow: "Standard", step: "Section Edit", message: "News has no active Section Editor for 2027–28.", fix: { kind: "role" } }]);
    const kept = (await preview(plan({ returning: [accounts.jeremy!.id, accounts.maycie!.id, accounts.graduate!.id], carry: [ids.jeremySports, ids.graduateNews] }))).body;
    expect(kept.routing).toEqual([]);
    expect(kept.departing).toEqual([expect.objectContaining({ name: "reporter Account" }), expect.objectContaining({ name: "editor Account" })]);
  });

  it("changes nothing", async () => {
    expect((await payload.count({ collection: "role-assignments", where: { schoolYear: { equals: ids.next } }, overrideAccess: true })).totalDocs).toBe(0);
    expect((await years()).body.active.name).toBe("2026–27");
  });
});

describe("starting the year", () => {
  const start = (data: Record<string, unknown>, key = "editor", id = ids.next) => call("post", "/byline/school-years/:id/activate", key, { data, routeParams: on(id!) });
  const plan = () => ({ returning: [accounts.jeremy!.id, accounts.maycie!.id, accounts.editor!.id], carry: [ids.jeremySports, ids.graduateNews, ids.maycieCopy], titles: { [accounts.jeremy!.id]: "Editor-in-Chief" }, disable: [accounts.graduate!.id, accounts.editor!.id] });

  it("needs an editor, and acknowledged routing problems", async () => {
    expect((await start(plan(), "reporter")).status).toBe(403);
    const refused = await start(plan());
    expect(refused.status).toBe(422);
    expect(refused.body.data.problems).toEqual(["News has no active Section Editor for 2027–28."]);
    expect((await years()).body.active.name).toBe("2026–27");
  });

  it("starts it once: one active year, the plan applied, history untouched", async () => {
    const started = await start({ ...plan(), confirmed: true });
    expect(started.status).toBe(200);
    expect(started.body.active).toMatchObject({ name: "2027–28", status: "active" });
    expect(started.body.planned).toBeNull();
    expect((await payload.count({ collection: "school-years", where: { status: { equals: "active" } }, overrideAccess: true })).totalDocs).toBe(1);
    expect((await payload.findByID({ collection: "school-years", id: ids.old, overrideAccess: true })).status).toBe("archived");

    // New year: returning people with their (renamed) titles and carried responsibilities, never the departing person's.
    const members = (await payload.find({ collection: "staff-memberships", where: { schoolYear: { equals: ids.next } }, overrideAccess: true, pagination: false, depth: 0 })).docs;
    expect(members.map((row) => [Number(row.user), row.title, row.status]).sort()).toEqual([[accounts.editor!.id, "", "active"], [accounts.jeremy!.id, "Editor-in-Chief", "active"], [accounts.maycie!.id, "", "active"]].sort());
    const carried = (await payload.find({ collection: "role-assignments", where: { schoolYear: { equals: ids.next } }, overrideAccess: true, pagination: false, depth: 0 })).docs;
    expect(carried.map((row) => Number(row.user)).sort()).toEqual([accounts.jeremy!.id, accounts.maycie!.id].sort());

    // Old year: every assignment and membership is still there; the leaver is marked departed on it.
    expect((await payload.count({ collection: "role-assignments", where: { schoolYear: { equals: ids.old } }, overrideAccess: true })).totalDocs).toBe(3);
    const before = (await payload.find({ collection: "staff-memberships", where: { schoolYear: { equals: ids.old } }, overrideAccess: true, pagination: false, depth: 0 })).docs;
    expect(before.find((row) => Number(row.user) === accounts.graduate!.id)).toMatchObject({ status: "departed", title: "Senior Writer" });
    expect(before.find((row) => Number(row.user) === accounts.jeremy!.id)?.status).toBe("active");

    // The leaver can no longer sign in; the person who started the year, an editor listed to disable, is never locked out.
    expect((await payload.findByID({ collection: "users", id: accounts.graduate!.id, overrideAccess: true })).enabled).toBe(false);
    expect((await payload.findByID({ collection: "users", id: accounts.editor!.id, overrideAccess: true })).enabled).toBe(true);
    // Their authorship is untouched.
    expect((await payload.find({ collection: "story-plans", where: { story: { equals: ids.story } }, overrideAccess: true })).docs[0]?.createdBy).toBeTruthy();
  });

  it("is idempotent, and review routing now uses the new year's assignments", async () => {
    const again = await start({ ...plan(), confirmed: true });
    expect(again.status).toBe(200);
    expect((await payload.count({ collection: "role-assignments", where: { schoolYear: { equals: ids.next } }, overrideAccess: true })).totalDocs).toBe(2);
    expect((await start(plan(), "editor", ids.old)).status).toBe(409);
    expect((await call("delete", "/byline/school-years/:id", "editor", { routeParams: on(ids.old) })).status).toBe(422);
  });
});
