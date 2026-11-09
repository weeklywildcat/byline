import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOW_STEPS } from "../../src/domain/newsroom-roles";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import type { User } from "../../src/payload-types";

/**
 * Newsroom Roles, workflows, the routing preview and factual workload against
 * real PostgreSQL (docs/newsroom-roles.md): editors only; every write checks
 * the revision the editor saw; the preview is the production resolver, not a
 * copy of it.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const ids: Record<string, number> = {};
const story: Record<string, number> = {};
const system = { overrideAccess: true as const, context: { bylineSystem: true } };

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `nr-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `nr-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } as never, overrideAccess: true });
  accounts[key] = { ...user, collection: "users" } as User;
}

async function call(method: string, path: string, key: string, { data, routeParams = {}, search = "" }: { data?: unknown; routeParams?: Record<string, string>; search?: string } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await createLocalReq({ user: accounts[key] }, payload);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams(search) });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}
const roles = (key: string) => call("get", "/byline/roles", key);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type View = Record<string, any>;
const roleNamed = (overview: { roles: View[] }, name: string): View => overview.roles.find((role) => role.name === name)!;
const flows = (key: string) => call("get", "/byline/review-workflows", key);
const step = (stepId: string, label: string, roleId: number, roleMatch: string, target = "whole") => ({ stepId, label, target, resolver: "role", roleId, roleMatch, userId: null, conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] }, selfReview: "exclude-writers", fallback: "none" });

async function newStory(key: string, headline: string, section: number | null, contributors: number[], workflow = "writing", deadline?: string) {
  story[key] = (await payload.create({ collection: "stories", draft: true, data: { headline, section, contributors } as never, overrideAccess: true })).id;
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: story[key] } }, limit: 1, overrideAccess: true })).docs[0]!;
  await payload.update({ collection: "story-plans", id: plan.id, data: { workflow, createdBy: accounts.reporter.id, ...(deadline ? { deadline } : {}) } as never, ...system });
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_roles`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("reporter", "staff");
  await account("jeremy", "staff");
  await account("maycie", "staff");
  ids.sports = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "nr-sports" } })).id;
  ids.news = (await payload.create({ collection: "sections", data: { name: "News", slug: "nr-news" } })).id;
  ids.year = (await payload.create({ collection: "school-years", data: { name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31", status: "active", revision: 1 }, ...system })).id;
  ids.oldYear = (await payload.create({ collection: "school-years", data: { name: "2025–26", startsOn: "2025-08-01", endsOn: "2026-07-31", status: "archived", revision: 1 }, ...system })).id;
  ids.sectionEditor = (await payload.create({ collection: "newsroom-roles", data: { key: "section-editor", name: "Section Editor", scopeKind: "section", waitingLabel: "{scope} Editor", revision: 1 }, ...system })).id;
  ids.copyDesk = (await payload.create({ collection: "newsroom-roles", data: { key: "copy-desk", name: "Copy Desk", scopeKind: "none", revision: 1 }, ...system })).id;
  ids.visualDesk = (await payload.create({ collection: "newsroom-roles", data: { key: "visual-desk", name: "Visual Desk", scopeKind: "media", revision: 1 }, ...system })).id;
  await payload.create({ collection: "role-assignments", data: { role: ids.sectionEditor, user: accounts.jeremy.id, schoolYear: ids.oldYear, scopeMode: "scoped", sections: [ids.news] }, ...system });
  await payload.create({ collection: "review-workflows", data: { name: "Standard", isDefault: true, steps: DEFAULT_WORKFLOW_STEPS, revision: 1 }, ...system } as never);
  await payload.create({ collection: "review-workflows", data: { name: "Sports desk", isDefault: false, appliesTo: { sections: [ids.sports] }, steps: [step("section", "Section Edit", ids.sectionEditor, "story-section")], revision: 1 }, ...system } as never);
  ids.assignmentOld = (await payload.find({ collection: "role-assignments", limit: 1, overrideAccess: true })).docs[0]!.id;
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("roles", () => {
  it("are for editors only", async () => {
    expect((await roles("reporter")).status).toBe(403);
    expect((await call("post", "/byline/roles", "reporter", { data: { name: "Hacker Desk" } })).status).toBe(403);
    expect((await flows("reporter")).status).toBe(403);
    expect((await call("get", "/byline/workload", "reporter")).status).toBe(403);
    expect((await call("post", "/byline/review-workflows/preview", "reporter", { data: { storyId: 1 } })).status).toBe(403);
  });

  it("are created with a stable key, and a repeated name never collides", async () => {
    const first = await call("post", "/byline/roles", "editor", { data: { name: "Sports Desk", description: "Covers games", scopeKind: "section", waitingLabel: "{scope} Desk" } });
    expect(first.status).toBe(200);
    const second = await call("post", "/byline/roles", "editor", { data: { name: "Sports Desk" } });
    const keys = (await payload.find({ collection: "newsroom-roles", where: { name: { equals: "Sports Desk" } }, sort: "id", overrideAccess: true })).docs.map((role) => role.key);
    expect(keys).toEqual(["sports-desk", "sports-desk-2"]);
    expect(second.status).toBe(200);
    expect((await call("post", "/byline/roles", "editor", { data: { name: "   " } })).status).toBe(422);
  });

  it("change only against the revision the editor saw", async () => {
    const before = roleNamed((await roles("editor")).body, "Copy Desk");
    const renamed = await call("patch", "/byline/roles/:id", "editor", { routeParams: { id: String(before.id) }, data: { name: "Copy Desk", description: "Style and spelling", expectedRevision: before.revision } });
    expect(renamed.status).toBe(200);
    const stale = await call("patch", "/byline/roles/:id", "editor", { routeParams: { id: String(before.id) }, data: { description: "Lost update", expectedRevision: before.revision } });
    expect(stale.status).toBe(409);
    expect(roleNamed(renamed.body, "Copy Desk")).toMatchObject({ description: "Style and spelling", revision: before.revision + 1 });
  });
});

describe("memberships", () => {
  const add = (roleKey: string, data: Record<string, unknown>) => call("post", "/byline/roles/:id/assignments", "editor", { routeParams: { id: String(ids[roleKey]) }, data });

  it("add people to the active year, scoped only the way the role is scoped", async () => {
    expect((await add("sectionEditor", { userId: accounts.jeremy.id, scopeMode: "scoped", sectionIds: [] })).body.data.problems).toEqual(["Choose at least one Section."]);
    expect((await add("sectionEditor", { userId: accounts.jeremy.id, scopeMode: "scoped", sectionIds: [987654] })).status).toBe(422);
    expect((await add("copyDesk", { userId: accounts.maycie.id, scopeMode: "scoped", sectionIds: [ids.sports] })).status).toBe(422);
    const added = await add("sectionEditor", { userId: accounts.jeremy.id, scopeMode: "scoped", sectionIds: [ids.sports] });
    expect(added.status).toBe(200);
    expect(roleNamed(added.body, "Section Editor").members).toMatchObject([{ name: "jeremy Account", scopeMode: "scoped", sections: ["Sports"] }]);
    const media = await add("visualDesk", { userId: accounts.maycie.id, scopeMode: "scoped", mediaTypes: ["photo"] });
    expect(roleNamed(media.body, "Visual Desk").members[0]).toMatchObject({ mediaTypes: ["photo"] });
    expect((await add("copyDesk", { userId: accounts.maycie.id, scopeMode: "global" })).status).toBe(200);
  });

  it("refuse a second membership for the same person, and let the first be edited or removed", async () => {
    expect((await add("copyDesk", { userId: accounts.maycie.id, scopeMode: "global" })).status).toBe(409);
    const overview = (await roles("editor")).body;
    const member = roleNamed(overview, "Section Editor").members[0];
    const edited = await call("patch", "/byline/roles/:id/assignments/:assignment", "editor", { routeParams: { id: String(ids.sectionEditor), assignment: String(member.id) }, data: { userId: accounts.jeremy.id, scopeMode: "scoped", sectionIds: [ids.sports, ids.news] } });
    expect(roleNamed(edited.body, "Section Editor").members[0].sections.sort()).toEqual(["News", "Sports"]);
    const removed = await call("delete", "/byline/roles/:id/assignments/:assignment", "editor", { routeParams: { id: String(ids.visualDesk), assignment: String(roleNamed(overview, "Visual Desk").members[0].id) } });
    expect(roleNamed(removed.body, "Visual Desk").members).toEqual([]);
  });

  it("keep earlier years as history: they are neither listed nor editable", async () => {
    const overview = (await roles("editor")).body;
    expect(JSON.stringify(overview)).not.toContain(`"id":${ids.assignmentOld},"userId"`);
    const edit = await call("patch", "/byline/roles/:id/assignments/:assignment", "editor", { routeParams: { id: String(ids.sectionEditor), assignment: String(ids.assignmentOld) }, data: { userId: accounts.jeremy.id, scopeMode: "global" } });
    expect(edit.status).toBe(422);
    expect((await call("delete", "/byline/roles/:id/assignments/:assignment", "editor", { routeParams: { id: String(ids.sectionEditor), assignment: String(ids.assignmentOld) } })).status).toBe(422);
    expect((await payload.count({ collection: "role-assignments", where: { schoolYear: { equals: ids.oldYear } }, overrideAccess: true })).totalDocs).toBe(1);
  });

  it("can't change what a role is scoped to while scoped members exist, or be archived while a workflow uses it", async () => {
    const overview = (await roles("editor")).body;
    const section = roleNamed(overview, "Section Editor");
    expect((await call("patch", "/byline/roles/:id", "editor", { routeParams: { id: String(section.id) }, data: { scopeKind: "media" } })).status).toBe(422);
    const archive = await call("patch", "/byline/roles/:id", "editor", { routeParams: { id: String(section.id) }, data: { archived: true } });
    expect(archive.status).toBe(422);
    expect(archive.body.message).toContain("Sports desk");
    expect(section.usedBy.map((workflow: View) => workflow.name)).toEqual(["Sports desk"]);
    const unused = roleNamed(overview, "Visual Desk");
    expect((await call("patch", "/byline/roles/:id", "editor", { routeParams: { id: String(unused.id) }, data: { archived: true } })).status).toBe(200);
    expect((await add("visualDesk", { userId: accounts.maycie.id, scopeMode: "global" })).status).toBe(422);
  });
});

describe("workflows", () => {
  const byName = (overview: { workflows: View[] }, name: string): View => overview.workflows.find((workflow) => workflow.name === name)!;

  it("are validated: every way a step can be wrong is explained, and nothing is saved", async () => {
    const attempt = (steps: unknown) => call("post", "/byline/review-workflows", "editor", { data: { name: "Broken", steps } });
    expect((await attempt([])).body.data.problems).toEqual(["Add at least one review step."]);
    expect((await attempt([step("a", "Copy", 987654, "any")])).body.data.problems).toEqual(["Copy uses a newsroom role that doesn't exist."]);
    expect((await attempt([step("a", "Copy", ids.copyDesk, "story-section")])).body.data.problems).toEqual(["Copy matches the Story's Section, but Copy Desk isn't scoped by Section."]);
    expect((await attempt([step("a", "Copy", ids.visualDesk, "any")])).body.data.problems).toEqual(["Copy uses Visual Desk, which is archived."]);
    expect((await attempt([{ stepId: "a", label: " " }])).status).toBe(422);
    expect((await payload.count({ collection: "review-workflows", where: { name: { equals: "Broken" } }, overrideAccess: true })).totalDocs).toBe(0);
  });

  it("are created, reordered and edited, with the order kept and revisions checked", async () => {
    const created = await call("post", "/byline/review-workflows", "editor", { data: { name: "News desk", appliesTo: { sections: [ids.news] }, steps: [step("copy", "Copy", ids.copyDesk, "any", "copy"), step("final", "Final read", ids.copyDesk, "any")] } });
    expect(created.status).toBe(200);
    const workflow = byName(created.body, "News desk");
    expect(workflow.steps.map((entry: View) => entry.stepId)).toEqual(["copy", "final"]);
    const reordered = await call("patch", "/byline/review-workflows/:id", "editor", { routeParams: { id: String(workflow.id) }, data: { steps: [step("final", "Final read", ids.copyDesk, "any"), step("copy", "Copy", ids.copyDesk, "any", "copy")], expectedRevision: workflow.revision } });
    expect(byName(reordered.body, "News desk").steps.map((entry: View) => entry.stepId)).toEqual(["final", "copy"]);
    const stale = await call("patch", "/byline/review-workflows/:id", "editor", { routeParams: { id: String(workflow.id) }, data: { name: "Lost", expectedRevision: workflow.revision } });
    expect(stale.status).toBe(409);
  });

  it("always have exactly one default, which can move but not disappear", async () => {
    const overview = (await flows("editor")).body;
    expect(overview.workflows.filter((workflow: { isDefault: boolean }) => workflow.isDefault)).toHaveLength(1);
    const standard = byName(overview, "Standard");
    expect((await call("patch", "/byline/review-workflows/:id", "editor", { routeParams: { id: String(standard.id) }, data: { isDefault: false } })).status).toBe(422);
    expect((await call("patch", "/byline/review-workflows/:id", "editor", { routeParams: { id: String(standard.id) }, data: { archived: true } })).status).toBe(422);
    const news = byName(overview, "News desk");
    const moved = await call("patch", "/byline/review-workflows/:id", "editor", { routeParams: { id: String(news.id) }, data: { isDefault: true } });
    expect(moved.body.workflows.filter((workflow: { isDefault: boolean }) => workflow.isDefault).map((workflow: { name: string }) => workflow.name)).toEqual(["News desk"]);
    await call("patch", "/byline/review-workflows/:id", "editor", { routeParams: { id: String(standard.id) }, data: { isDefault: true } });
  });
});

describe("routing preview", () => {
  const preview = (data: Record<string, unknown>) => call("post", "/byline/review-workflows/preview", "editor", { data });

  beforeAll(async () => {
    await newStory("game", "Patriot Games", ids.sports, [people.reporter]);
    await newStory("lunch", "Lunch line", ids.news, [people.reporter]);
    ids.opinion = (await payload.create({ collection: "sections", data: { name: "Opinion", slug: "nr-opinion" } })).id;
    await newStory("op", "Why lunch matters", ids.opinion, [people.reporter]);
  });

  it("goes through the production resolver: the preview and a real submission route to the same person", async () => {
    const shown = (await preview({ storyId: story.game })).body;
    expect(shown.workflow.name).toBe("Sports desk");
    expect(shown.steps).toMatchObject([{ stepId: "section", kind: "person", waitingFor: "Sports Editor", people: ["jeremy Account"] }]);

    const submit = newsroomEndpoints.find((endpoint) => endpoint.method === "post" && endpoint.path === "/byline/stories/:id/review/submit")!;
    const req = await createLocalReq({ user: accounts.reporter }, payload);
    Object.assign(req, { routeParams: { id: String(story.game) }, searchParams: new URLSearchParams() });
    const submitted = await ((await submit.handler(req)) as Response).json();
    expect(submitted.run.workflowName).toBe(shown.workflow.name);
    expect(submitted.run.steps.map((entry: { waitingFor: string | null }) => entry.waitingFor)).toEqual(shown.steps.map((entry: { waitingFor: string | null }) => entry.waitingFor));
  });

  it("previews an unsaved draft, so an editor sees the effect before saving", async () => {
    const draft = await preview({ storyId: story.lunch, steps: [step("copy", "Copy", ids.copyDesk, "any", "copy"), step("edit", "Edit", ids.copyDesk, "any")] });
    expect(draft.status).toBe(200);
    expect(draft.body.workflow.name).toBe("Unsaved workflow");
    expect(draft.body.steps.map((entry: { stepId: string; kind: string }) => [entry.stepId, entry.kind])).toEqual([["copy", "person"], ["edit", "person"]]);
    expect(draft.body.failed).toBe(0);
    // Submission would not use the draft: this story is in News, which has its own saved workflow.
    expect(draft.body.actual.name).toBe("News desk");
    expect((await preview({ storyId: story.game })).body.actual.name).toBe("Sports desk");
  });

  it("explains a role nobody holds as a failure an editor can fix", async () => {
    const result = await preview({ storyId: story.op, steps: [step("section", "Section Edit", ids.sectionEditor, "story-section")] });
    expect(result.body.failed).toBe(1);
    expect(result.body.steps[0]).toMatchObject({ kind: "failed", fix: { kind: "role", roleId: ids.sectionEditor } });
    expect(result.body.steps[0].detail).toContain("Opinion has no active Section Editor");
  });

  it("refuses a malformed request without running anything", async () => {
    expect((await preview({})).status).toBe(422);
    expect((await preview({ storyId: story.lunch, steps: [{ stepId: "x", label: "" }] })).status).toBe(422);
    expect((await preview({ storyId: story.lunch, workflowId: 987654 })).status).toBe(404);
    expect((await preview({ storyId: 987654 })).status).toBe(404);
  });
});

describe("workload", () => {
  it("counts what is on each person's plate, alphabetically, and nothing else", async () => {
    const yesterday = new Date(Date.now() - 48 * 3600_000).toISOString().slice(0, 10);
    await newStory("late", "Overdue feature", ids.news, [people.reporter], "writing", yesterday);
    const rows = (await call("get", "/byline/workload", "editor")).body.rows as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.name)).toEqual([...rows.map((row) => row.name as string)].sort((a, b) => a.localeCompare(b)));
    const reporter = rows.find((row) => row.userId === accounts.reporter.id)!;
    expect(reporter.overdue).toBeGreaterThanOrEqual(1);
    expect(reporter.activeStories).toBeGreaterThanOrEqual(2);
    const jeremy = rows.find((row) => row.userId === accounts.jeremy.id)!;
    expect(jeremy.reviews).toBe(1);
    expect(Object.keys(reporter).sort()).toEqual(["activeStories", "dueThisWeek", "mediaAssignments", "name", "overdue", "reviews", "role", "userId"]);
  });
});
