import { createLocalReq, getPayload, type Payload } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOW_STEPS } from "../../src/domain/newsroom-roles";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import type { User } from "../../src/payload-types";

/**
 * Review fidelity against real PostgreSQL (docs/review.md): the submitted view
 * carries the actual media of the submitted version, flags a file edited
 * underneath the review instead of silently showing it, and answers "what
 * changed since I last reviewed this?" from the two immutable versions.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const ids: Record<string, number> = {};
const system = { overrideAccess: true as const, context: { bylineSystem: true } };

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `rf-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `rf-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } as never, overrideAccess: true });
  accounts[key] = { ...user, collection: "users" } as User;
}

async function call(method: string, path: string, key: string, { data, routeParams = {} }: { data?: unknown; routeParams?: Record<string, string> } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await createLocalReq({ user: accounts[key] }, payload);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams() });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}

async function image(name: string, background: string, alt: string) {
  const data = await sharp({ create: { width: 640, height: 400, channels: 3, background } }).jpeg().toBuffer();
  return (await payload.create({ collection: "media", file: { data, mimetype: "image/jpeg", name: `${name}.jpg`, size: data.length }, data: { alt, credit: "Weekly Wildcat", copyright: "Weekly Wildcat" }, ...system } as never)).id;
}

const p = (text: string) => ({ type: "paragraph", children: [{ type: "text", text }] });
const photo = (media: number, caption: string) => ({ type: "block", fields: { blockType: "photo", id: `photo-${media}`, media, caption, altOverride: "", placement: "wide" } });
const body = (...children: unknown[]) => ({ root: { type: "root", children, direction: "ltr", format: "", indent: 0, version: 1 } });

const at = () => ({ id: String(ids.story) });
const review = (key: string) => call("get", "/byline/stories/:id/review", key, { routeParams: at() });
const submitted = (key: string) => call("get", "/byline/stories/:id/review/submitted", key, { routeParams: at() });

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_fidelity`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("reporter", "staff");
  await account("jeremy", "staff");
  ids.news = (await payload.create({ collection: "sections", data: { name: "News", slug: "rf-news" } })).id;
  await payload.create({ collection: "school-years", data: { name: "2026–27", startsOn: "2026-08-01", endsOn: "2027-07-31", status: "active", revision: 1 }, ...system });
  await payload.create({ collection: "review-workflows", data: { name: "Standard", isDefault: true, steps: DEFAULT_WORKFLOW_STEPS, revision: 1 }, ...system } as never);
  ids.lead = await image("lead", "#2a6", "The cafeteria");
  ids.line = await image("line", "#58763f", "A long lunch line");
  ids.menu = await image("menu", "#7b2336", "The new menu");
  ids.story = (await payload.create({
    collection: "stories", draft: true, overrideAccess: true,
    data: { headline: "Greenwood's lunch line", section: ids.news, contributors: [people.reporter], featuredMedia: ids.lead, featuredCaption: "Lunch", body: body(p("The canteen closed in May."), p("Students now bring lunch."), photo(ids.line, "Students wait.")) } as never
  })).id;
  const plan = (await payload.find({ collection: "story-plans", where: { story: { equals: ids.story } }, limit: 1, overrideAccess: true })).docs[0]!;
  await payload.update({ collection: "story-plans", id: plan.id, data: { workflow: "writing", createdBy: accounts.reporter.id, editor: accounts.jeremy.id } as never, ...system });
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("the submitted view's media", () => {
  it("lists the files this exact version names, with what a reviewer needs to judge them", async () => {
    expect((await call("post", "/byline/stories/:id/review/submit", "reporter", { routeParams: at() })).status).toBe(200);
    const result = (await submitted("jeremy")).body;
    expect(result.media.map((file: { id: number }) => file.id).sort()).toEqual([ids.lead, ids.line].sort());
    const line = result.media.find((file: { id: number }) => file.id === ids.line);
    expect(line).toMatchObject({ kind: "image", alt: "A long lunch line", credit: "Weekly Wildcat", state: "unchanged", width: 640, height: 400 });
    expect(line.previewUrl ?? line.url).toMatch(/media/);
    expect(result.story.body.root.children).toHaveLength(3);
    // The byline the submitted version carries, as names in order.
    expect(result.byline).toEqual(["reporter Writer"]);
  });

  it("flags a file whose crop was edited after submission, never swapping it in silently", async () => {
    await payload.update({ collection: "media", id: ids.line, data: { artDirection: { focalPoint: { x: 0.2, y: 0.3 } } } as never, ...system });
    const revision = (await payload.findByID({ collection: "media", id: ids.line, depth: 0 })).publicationRevision;
    expect(revision).toBeGreaterThan(0);
    const result = (await submitted("jeremy")).body;
    expect(result.media.find((file: { id: number }) => file.id === ids.line).state).toBe("changed");
    expect(result.media.find((file: { id: number }) => file.id === ids.lead).state).toBe("unchanged");
  });

  it("is not available to people with no part in the review", async () => {
    expect((await submitted("reporter")).status).toBe(200);
    const stranger = await account("stranger", "staff").then(() => submitted("stranger"));
    expect(stranger.status).toBe(403);
  });
});

describe("changes since your last review", () => {
  it("is empty for someone who hasn't reviewed before", async () => {
    expect((await review("jeremy")).body.changesSinceYourReview).toBeNull();
  });

  it("compares the version a reviewer decided on with the resubmitted one, in words and in media", async () => {
    const state = (await review("jeremy")).body;
    expect((await call("post", "/byline/stories/:id/review/decision", "jeremy", { routeParams: at(), data: { decision: "request-changes", expectedRevision: state.run.revision } })).status).toBe(200);
    // The writer fixes one sentence and swaps the photo (with its caption).
    await payload.update({ collection: "stories", id: ids.story, draft: true, overrideAccess: true, data: { body: body(p("The canteen closed in May."), p("Students now bring lunch from home."), photo(ids.menu, "The new menu.")) } as never });
    expect((await call("post", "/byline/stories/:id/review/submit", "reporter", { routeParams: at() })).status).toBe(200);
    const changed = (await review("jeremy")).body.changesSinceYourReview;
    expect(changed.categories).toEqual(["copy", "visuals"]);
    expect(changed.comparison.counts).toEqual({ changed: 1, added: 0, removed: 0 });
    const sentence = changed.comparison.blocks.find((block: { id: string }) => block.id === "b1");
    expect(sentence.parts.filter((part: { change: string }) => part.change === "added").map((part: { text: string }) => part.text)).toEqual([" from home"]);
    expect(changed.comparison.visuals).toEqual([{ change: "replaced", where: "Photo", before: [ids.line], after: [ids.menu] }]);
    // The new photo carries its own caption, so it is reported as a replaced photo, not as a caption edit.
    expect(changed.copySummary).toBe("1 passage edited");
    expect(changed.visualSummary).toBe("Photo replaced");
    // The submitted view now carries the new photo, not the old one.
    expect((await submitted("jeremy")).body.media.map((file: { id: number }) => file.id).sort()).toEqual([ids.lead, ids.menu].sort());
  });
});
