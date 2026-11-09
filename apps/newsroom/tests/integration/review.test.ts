import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOW_STEPS } from "../../src/domain/newsroom-roles";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import type { User } from "../../src/payload-types";

/**
 * The review engine against real PostgreSQL (docs/review.md): a reporter
 * presses Submit and nothing else; routing resolves Newsroom Roles in the
 * active school year; feedback is published with the decision; resubmission
 * returns to the same gate; approvals send the Story up to Ready; retries and
 * double clicks never advance a review twice; routing failures stay out of
 * Review and tell the editors.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};
const ids: Record<string, number> = {};
const system = { overrideAccess: true as const, context: { bylineSystem: true } };

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `rv-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `rv-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } });
  accounts[key] = { ...user, collection: "users" } as User;
}

async function call(method: string, path: string, key: string, { data, routeParams = {} }: { data?: unknown; routeParams?: Record<string, string> } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await createLocalReq({ user: accounts[key] }, payload);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams() });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}
const at = (storyKey: string) => ({ id: String(story[storyKey]) });
const review = (key: string, storyKey: string) => call("get", "/byline/stories/:id/review", key, { routeParams: at(storyKey) });
const submit = (key: string, storyKey: string) => call("post", "/byline/stories/:id/review/submit", key, { routeParams: at(storyKey) });
const comment = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/stories/:id/review/comments", key, { data, routeParams: at(storyKey) });
const decide = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/stories/:id/review/decision", key, { data, routeParams: at(storyKey) });
const lifecycle = (key: string, storyKey: string, transition: string) => call("post", "/byline/stories/:id/lifecycle", key, { data: { transition }, routeParams: at(storyKey) });
const stage = async (storyKey: string) => (await payload.find({ collection: "story-plans", where: { story: { equals: story[storyKey] } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]!.workflow;

async function newStory(key: string, headline: string, section: number | null, contributors: number[], workflow = "writing") {
  story[key] = (await payload.create({ collection: "stories", draft: true, data: { headline, section, contributors } as never, overrideAccess: true })).id;
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: story[key] } }, limit: 1, overrideAccess: true })).docs[0]!;
  await payload.update({ collection: "story-plans", id: plan.id, data: { workflow, createdBy: accounts.reporter.id } as never, ...system });
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_review`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("reporter", "staff");
  await account("jeremy", "staff");
  await account("maycie", "staff");
  await account("caroline", "staff");
  ids.sports = (await payload.create({ collection: "sections", data: { name: "Sports", slug: "rv-sports" } })).id;
  ids.news = (await payload.create({ collection: "sections", data: { name: "News", slug: "rv-news" } })).id;
  ids.year = (await payload.create({ collection: "school-years", data: { name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31", status: "active", revision: 1 }, ...system })).id;
  ids.sectionEditor = (await payload.create({ collection: "newsroom-roles", data: { key: "section-editor", name: "Section Editor", scopeKind: "section", waitingLabel: "{scope} Editor", revision: 1 }, ...system })).id;
  ids.copyDesk = (await payload.create({ collection: "newsroom-roles", data: { key: "copy-desk", name: "Copy Desk", scopeKind: "none", revision: 1 }, ...system })).id;
  await payload.create({ collection: "role-assignments", data: { role: ids.sectionEditor, user: accounts.jeremy.id, schoolYear: ids.year, scopeMode: "scoped", sections: [ids.sports] }, ...system });
  await payload.create({ collection: "role-assignments", data: { role: ids.copyDesk, user: accounts.maycie.id, schoolYear: ids.year, scopeMode: "global" }, ...system });
  await payload.create({ collection: "role-assignments", data: { role: ids.copyDesk, user: accounts.caroline.id, schoolYear: ids.year, scopeMode: "global" }, ...system });
  const step = (stepId: string, label: string, roleId: number, roleMatch: string, target = "whole") => ({ stepId, label, target, resolver: "role", roleId, roleMatch, userId: null, conditions: { sections: [], formats: [], onlyWithVisuals: false, mediaTypes: [] }, selfReview: "exclude-writers", fallback: "none" });
  await payload.create({ collection: "review-workflows", data: { name: "Standard", isDefault: true, steps: DEFAULT_WORKFLOW_STEPS, revision: 1 }, ...system } as never);
  await payload.create({ collection: "review-workflows", data: { name: "Sports desk", isDefault: false, appliesTo: { sections: [ids.sports] }, steps: [step("section", "Section Edit", ids.sectionEditor, "story-section"), step("copy", "Copy Review", ids.copyDesk, "any", "copy")], revision: 1 }, ...system } as never);
  await newStory("game", "Patriot Games", ids.sports, [people.reporter]);
  await newStory("empty", "", null, []);
  await newStory("pitch", "A pitch", ids.sports, [people.reporter], "pitch");
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("submitting", () => {
  it("refuses ordinary Story problems with a list, without routing", async () => {
    const result = await submit("reporter", "empty");
    expect(result.status).toBe(422);
    expect(result.body.data.problems.map((problem: { message: string }) => problem.message)).toEqual(["Add a headline", "Add a Section", "Add at least one writer"]);
    expect(await stage("empty")).toBe("writing");
  });

  it("refuses a pitch until it is accepted, and only editors accept pitches", async () => {
    expect((await submit("reporter", "pitch")).status).toBe(409);
    expect((await lifecycle("reporter", "pitch", "accept-pitch")).status).toBe(403);
    expect((await lifecycle("editor", "pitch", "accept-pitch")).body).toMatchObject({ phase: "reporting", label: "Reporting" });
    expect((await lifecycle("reporter", "pitch", "start-drafting")).body).toMatchObject({ phase: "drafting" });
    expect(await stage("pitch")).toBe("writing");
  });

  it("routes with no form: version captured, workflow chosen, Story in Review", async () => {
    const result = await submit("reporter", "game");
    expect(result.status).toBe(200);
    expect(result.body.phase).toBe("review");
    expect(result.body.run).toMatchObject({ status: "active", round: 1, workflowName: "Sports desk", newerDraft: false });
    expect(result.body.run.steps.map((step: { state: string; waitingFor: string | null }) => [step.state, step.waitingFor])).toEqual([["active", "Sports Editor"], ["pending", null]]);
    expect(result.body.run.submittedVersion).toMatch(/^\d+$/);
    expect(await stage("game")).toBe("editing");
    const notifications = await payload.find({ collection: "notifications", where: { and: [{ recipient: { equals: accounts.jeremy.id } }, { kind: { equals: "readyForReview" } }] }, overrideAccess: true });
    expect(notifications.totalDocs).toBe(1);
  });

  it("is idempotent: a second press doesn't make a second review", async () => {
    const again = await submit("reporter", "game");
    expect(again.status).toBe(200);
    expect((await payload.count({ collection: "review-runs", where: { story: { equals: story.game } }, overrideAccess: true })).totalDocs).toBe(1);
  });

  it("lets the routed reviewer, not the writer, act", async () => {
    expect((await review("jeremy", "game")).body.viewer).toMatchObject({ canReview: true, isWriter: false });
    expect((await review("reporter", "game")).body.viewer).toMatchObject({ canReview: false, isWriter: true, canSubmit: false });
    expect((await comment("reporter", "game", { body: "Me again" })).status).toBe(403);
  });
});

describe("feedback and resubmission", () => {
  it("keeps comments pending, then publishes them with Request changes", async () => {
    await comment("jeremy", "game", { quote: "Patriot Games", body: "Is this the official name?" });
    await comment("jeremy", "game", { body: "Add the final score high up." });
    expect((await review("reporter", "game")).body.comments).toEqual([]);
    expect((await review("jeremy", "game")).body.comments.map((entry: { state: string }) => entry.state)).toEqual(["pending", "pending"]);
    const revision = (await review("jeremy", "game")).body.run.revision;
    const decided = await decide("jeremy", "game", { decision: "request-changes", expectedRevision: revision });
    expect(decided.body.message ?? "ok").toBe("ok");
    expect(decided.status).toBe(200);
    expect(decided.body.run.status).toBe("changes-requested");
    expect(await stage("game")).toBe("writing");
    // A retried decision with the old revision does nothing.
    expect((await decide("jeremy", "game", { decision: "request-changes", expectedRevision: revision })).status).toBe(409);
    const seen = (await review("reporter", "game")).body;
    expect(seen.comments.map((entry: { state: string; quote: string | null }) => [entry.state, entry.quote])).toEqual([["published", "Patriot Games"], ["published", null]]);
    expect(seen.viewer).toMatchObject({ canSubmit: true, submitLabel: "Resubmit to Sports Editor" });
  });

  it("lets writers reply to and resolve published feedback", async () => {
    const thread = (await review("reporter", "game")).body.comments[0];
    const replied = await comment("reporter", "game", { parent: thread.id, body: "Yes, it is." });
    expect(replied.body.comments[0].replies[0]).toMatchObject({ body: "Yes, it is.", state: "published" });
    const resolved = await call("patch", "/byline/stories/:id/review/comments/:comment", "reporter", { data: { resolved: true }, routeParams: { ...at("game"), comment: String(thread.id) } });
    expect(resolved.body.comments[0].state).toBe("resolved");
  });

  it("returns a resubmission to the same reviewer at the same gate", async () => {
    await payload.update({ collection: "stories", id: story.game, draft: true, data: { headline: "Patriot Games: 21–14" }, overrideAccess: true });
    const result = await submit("reporter", "game");
    expect(result.body.run).toMatchObject({ status: "active", round: 2 });
    expect(result.body.run.steps[0]).toMatchObject({ state: "active", assignee: { name: "jeremy Account" } });
    expect(await stage("game")).toBe("editing");
  });
});

describe("approval", () => {
  it("approves and sends up to a role queue, then a queue member takes it to Ready", async () => {
    const revision = (await review("jeremy", "game")).body.run.revision;
    const up = await decide("jeremy", "game", { decision: "approve", expectedRevision: revision });
    expect(up.body.run.steps.map((step: { state: string }) => step.state)).toEqual(["approved", "active"]);
    expect(up.body.run.steps[1]).toMatchObject({ waitingFor: "Copy Desk", queueSize: 2, assignee: null });
    expect((await review("maycie", "game")).body.viewer).toMatchObject({ canReview: true, mustClaim: true });
    const claimed = await call("post", "/byline/stories/:id/review/claim", "maycie", { routeParams: at("game") });
    expect(claimed.body.run.steps[1].assignee).toMatchObject({ name: "maycie Account" });
    expect((await review("caroline", "game")).status).toBe(200);
    expect((await review("caroline", "game")).body.viewer.canReview).toBe(false);
    const done = await decide("maycie", "game", { decision: "approve", expectedRevision: claimed.body.run.revision });
    expect(done.body.run.status).toBe("approved");
    expect(done.body.phase).toBe("ready");
    expect(await stage("game")).toBe("ready");
  });

  it("stales only the approvals a change touches", async () => {
    await payload.update({ collection: "stories", id: story.game, draft: true, data: { headline: "Patriot Games: 21–14 final" }, overrideAccess: true });
    const state = (await review("reporter", "game")).body;
    expect(state.run.steps.map((step: { state: string }) => step.state)).toEqual(["stale", "stale"]);
    expect(state.run.steps[1].staleReason).toBe("The text changed after this approval.");
    expect(state.viewer).toMatchObject({ canSubmit: true, submitLabel: "Resubmit for review" });
  });
});

describe("routing failures", () => {
  it("keeps the Story out of Review, explains why and tells the editors", async () => {
    await newStory("orphan", "Lost in Sports", ids.sports, [people.jeremy]);
    // Jeremy wrote it, so the only Sports Editor can't review it.
    const result = await submit("jeremy", "orphan");
    expect(result.body.run).toMatchObject({ status: "routing-failed", failure: "Sports has no active Section Editor for 2026–27." });
    expect(await stage("orphan")).toBe("writing");
    const told = await payload.find({ collection: "notifications", where: { and: [{ recipient: { equals: accounts.editor.id } }, { kind: { equals: "reviewRouting" } }] }, overrideAccess: true });
    expect(told.totalDocs).toBe(1);
  });

  it("closes an open review when an editor puts the Story on hold", async () => {
    await newStory("held", "Held story", ids.news, [people.reporter]);
    expect((await submit("reporter", "held")).body.run.status).toBe("active");
    await lifecycle("editor", "held", "put-on-hold");
    expect((await payload.find({ collection: "review-runs", where: { story: { equals: story.held } }, overrideAccess: true })).docs[0]!.status).toBe("cancelled");
    expect((await lifecycle("editor", "held", "resume")).body.phase).toBe("drafting");
  });
});
