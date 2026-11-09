import { getWeeklyWildcatHomeDesign, homepageSlots, validatePlacements, type HomepagePlacements, type HomepageSlot, type PlacementIssue } from "@byline/design";
import { APIError, commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest, type TaskConfig } from "payload";
import { atLeast, relationId } from "../access/user";
import { localToInstant } from "../domain/dates";
import { editorRecipients, notify } from "../newsroom/notifications";
import { recordStoryActivity } from "../newsroom/story-activity";
import type { ScreenContext } from "../newsroom/screen-models";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { PUBLICATION_QUEUE } from "../public/queue";
import { recordPublicMutation } from "../public/revision";
import { publishedHomepageStories } from "./stories";

/**
 * The Front Page Desk's server (docs/front-page.md).
 *
 * > Front Page changes editorial priority, not homepage design.
 *
 * The homepage design stays in code (`getWeeklyWildcatHomeDesign`); editors
 * only pin published Stories into its named slots or return them to automatic.
 * Changes collect in one shared draft revision; Publish (or a scheduled job)
 * activates it atomically and advances the public revision so the existing
 * snapshot → build → deploy flow runs. History is never mutated.
 */

export const FRONT_PAGE_TASK = "activate-front-page";
export const homeDesign = () => getWeeklyWildcatHomeDesign("weekly-wildcat");
const system = (req: PayloadRequest) => ({ req, overrideAccess: true as const, depth: 0 });

type Revision = { id: number; state: string; placements: Record<string, number>; scheduledAt?: string | null; activatedAt?: string | null; summary?: string | null; createdBy?: unknown; publishedBy?: unknown; updatedAt: string; failure?: string | null };

function requireEditor(ctx: ScreenContext) {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors change the homepage.", 403);
}

export function cleanPlacements(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([slot, story]) => {
    const id = Number(story);
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(slot) && slot.length <= 80 && Number.isSafeInteger(id) && id > 0 ? [[slot, id]] : [];
  }));
}

async function revisionIn(req: PayloadRequest, state: "draft" | "scheduled" | "active"): Promise<Revision | null> {
  const found = await req.payload.find({ collection: "front-page-revisions", where: { state: { equals: state } }, sort: "-updatedAt", limit: 1, ...system(req) });
  const row = found.docs[0];
  return row ? ({ ...row, placements: cleanPlacements(row.placements) } as Revision) : null;
}

export async function activePlacements(payload: Payload, req?: PayloadRequest): Promise<{ placements: Record<string, number>; activatedAt: string } | null> {
  const found = await payload.find({ collection: "front-page-revisions", where: { state: { equals: "active" } }, limit: 1, depth: 0, overrideAccess: true, ...(req ? { req } : {}) });
  const row = found.docs[0];
  if (!row?.activatedAt) return null;
  return { placements: cleanPlacements(row.placements), activatedAt: new Date(row.activatedAt).toISOString() };
}

/** "Changed Lead and In Focus": the slots whose Story differs. */
export function describeChanges(slots: readonly HomepageSlot[], from: HomepagePlacements, to: HomepagePlacements): { changed: string[]; summary: string } {
  const ids = [...new Set([...Object.keys(from), ...Object.keys(to)])].filter((id) => from[id] !== to[id]);
  const order = new Map(slots.map((slot, index) => [slot.id, index]));
  const labels = ids.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)).map((id) => slots.find((slot) => slot.id === id)?.label ?? id);
  const list = labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return { changed: ids, summary: labels.length ? `Changed ${list}` : "No changes" };
}

async function issuesFor(req: PayloadRequest, placements: HomepagePlacements): Promise<PlacementIssue[]> {
  const publication = publicationConfigFromGlobal(await readPublishedPublication(req.payload, req), 0);
  const stories = await publishedHomepageStories(req.payload, publication, req);
  const available = new Set(stories.map((story) => story.input.id));
  return validatePlacements(homepageSlots(homeDesign()), placements, (id) => available.has(id)).issues;
}

/* ---------------------------------------------------------------- the desk */

export type FrontPageDesk = {
  slots: Array<Pick<HomepageSlot, "id" | "label" | "packageId" | "featured">>;
  active: { id: number; placements: Record<string, number>; activatedAt: string | null } | null;
  draft: { id: number; placements: Record<string, number>; updatedAt: string } | null;
  scheduled: { id: number; placements: Record<string, number>; scheduledAt: string; failure: string | null } | null;
  /** Pending: what Publish would change, in slot labels. */
  changes: string[];
  issues: PlacementIssue[];
  stories: Record<number, { headline: string; section: string; publishedAt: string | null; published: boolean }>;
  history: Array<{ id: number; summary: string; at: string; by: string | null; state: string }>;
  timeZone: string;
};

export async function frontPageDesk(ctx: ScreenContext): Promise<FrontPageDesk> {
  requireEditor(ctx);
  const { req } = ctx;
  const slots = homepageSlots(homeDesign());
  const [active, draft, scheduled, history] = await Promise.all([
    revisionIn(req, "active"), revisionIn(req, "draft"), revisionIn(req, "scheduled"),
    req.payload.find({ collection: "front-page-revisions", where: { state: { in: ["active", "archived"] } }, sort: "-activatedAt", limit: 20, ...system(req) })
  ]);
  const pending = draft?.placements ?? active?.placements ?? {};
  const ids = [...new Set([...Object.values(active?.placements ?? {}), ...Object.values(pending), ...Object.values(scheduled?.placements ?? {})])];
  const rows = ids.length ? (await req.payload.find({ collection: "stories", where: { id: { in: ids } }, draft: false, pagination: false, select: { headline: true, _status: true, publishedAt: true, section: true }, depth: 1, overrideAccess: true, req })).docs : [];
  const users = [...new Set(history.docs.map((row) => Number(relationId(row.publishedBy))).filter(Boolean))];
  const names = users.length ? new Map((await req.payload.find({ collection: "users", where: { id: { in: users } }, pagination: false, select: { name: true }, ...system(req) })).docs.map((user) => [user.id, user.name])) : new Map<number, string>();
  return {
    slots: slots.map(({ id, label, packageId, featured }) => ({ id, label, packageId, featured })),
    active: active ? { id: active.id, placements: active.placements, activatedAt: active.activatedAt ?? null } : null,
    draft: draft ? { id: draft.id, placements: draft.placements, updatedAt: draft.updatedAt } : null,
    scheduled: scheduled?.scheduledAt ? { id: scheduled.id, placements: scheduled.placements, scheduledAt: scheduled.scheduledAt, failure: scheduled.failure ?? null } : null,
    changes: draft ? describeChanges(slots, active?.placements ?? {}, draft.placements).changed : [],
    issues: draft ? await issuesFor(req, draft.placements) : [],
    stories: Object.fromEntries(rows.map((row) => [row.id, { headline: row.headline, section: row.section && typeof row.section === "object" ? row.section.name : "", publishedAt: row.publishedAt ?? null, published: row._status === "published" }])),
    history: history.docs.map((row) => ({ id: row.id, summary: row.summary ?? "Changed the homepage", at: row.activatedAt ?? row.updatedAt, by: names.get(Number(relationId(row.publishedBy))) ?? null, state: row.state })),
    timeZone: ctx.timeZone
  };
}

/** The shared draft, created from the live lineup when someone first changes something. */
async function ensureDraft(ctx: ScreenContext): Promise<Revision> {
  const existing = await revisionIn(ctx.req, "draft");
  if (existing) return existing;
  const active = await revisionIn(ctx.req, "active");
  const created = await ctx.req.payload.create({ collection: "front-page-revisions", data: { state: "draft", placements: active?.placements ?? {}, createdBy: ctx.user.id as number, basedOn: active?.id ?? null }, ...system(ctx.req) });
  return { ...created, placements: cleanPlacements(created.placements) } as Revision;
}

/** Pin a Story in a slot (moving it if it was pinned elsewhere), or return the slot to automatic (`storyId: null`). */
export async function setPlacement(ctx: ScreenContext, input: { slot?: unknown; storyId?: unknown; expectedUpdatedAt?: unknown }) {
  requireEditor(ctx);
  const slotId = String(input.slot ?? "");
  if (!homepageSlots(homeDesign()).some((slot) => slot.id === slotId)) throw new APIError("That homepage slot doesn't exist.", 400);
  const storyId = input.storyId === null ? null : Number(input.storyId);
  if (storyId !== null) {
    if (!Number.isSafeInteger(storyId) || storyId <= 0) throw new APIError("Choose a published story.", 400);
    const found = await ctx.req.payload.find({ collection: "stories", where: { and: [{ id: { equals: storyId } }, { _status: { equals: "published" } }] }, draft: false, limit: 1, select: {}, ...system(ctx.req) });
    if (!found.docs.length) throw new APIError("Only published stories can go on the homepage.", 400);
  }
  const draft = await ensureDraft(ctx);
  if (typeof input.expectedUpdatedAt === "string" && input.expectedUpdatedAt && Date.parse(input.expectedUpdatedAt) !== Date.parse(draft.updatedAt)) {
    throw new APIError("Someone else changed the homepage draft. Review their change first.", 409);
  }
  const placements = Object.fromEntries(Object.entries(draft.placements).filter(([slot, story]) => slot !== slotId && story !== storyId));
  if (storyId !== null) placements[slotId] = storyId;
  const updated = await ctx.req.payload.update({ collection: "front-page-revisions", id: draft.id, data: { placements }, ...system(ctx.req) });
  return { draftId: updated.id, placements, updatedAt: updated.updatedAt };
}

export async function discardDraft(ctx: ScreenContext) {
  requireEditor(ctx);
  const draft = await revisionIn(ctx.req, "draft");
  if (draft) await ctx.req.payload.delete({ collection: "front-page-revisions", id: draft.id, ...system(ctx.req) });
  return { discarded: Boolean(draft) };
}

/**
 * Activates a revision atomically: validate, archive the active one, make this
 * active, advance the public revision (which queues the snapshot and deploy).
 * Refuses (and changes nothing) when a placement no longer applies: a pinned
 * Story was unpublished, or code removed its slot. Never substitutes silently.
 */
async function activate(req: PayloadRequest, revision: Revision, actor: number | string | null): Promise<{ summary: string }> {
  const issues = await issuesFor(req, revision.placements);
  if (issues.length) throw new APIError(`The homepage can't be published: ${issues.map(describeIssue).join(" ")}`, 409);
  const slots = homepageSlots(homeDesign());
  const owns = await initTransaction(req);
  try {
    const active = await revisionIn(req, "active");
    const { summary } = describeChanges(slots, active?.placements ?? {}, revision.placements);
    if (active) await req.payload.update({ collection: "front-page-revisions", id: active.id, data: { state: "archived" }, ...system(req) });
    await req.payload.update({ collection: "front-page-revisions", id: revision.id, data: { state: "active", activatedAt: new Date().toISOString(), publishedBy: (actor ?? null) as number | null, summary, scheduledAt: null, failure: null }, ...system(req) });
    await recordPublicMutation(req, "front page", { force: true });
    if (owns) await commitTransaction(req);
    // Newly pinned Stories record it in their own activity.
    const before = new Set(Object.values(active?.placements ?? {}));
    for (const storyId of new Set(Object.values(revision.placements))) if (!before.has(storyId)) await recordStoryActivity(req, storyId, "homepage-featured");
    return { summary };
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
}

function describeIssue(issue: PlacementIssue): string {
  if (issue.reason === "story-unavailable") return `Story ${issue.storyId} is no longer published (${issue.slotId}).`;
  if (issue.reason === "unknown-slot") return `The ${issue.slotId} slot no longer exists on the homepage.`;
  return `Story ${issue.storyId} is placed twice.`;
}

export async function publishFrontPage(ctx: ScreenContext) {
  requireEditor(ctx);
  const draft = await revisionIn(ctx.req, "draft");
  if (!draft) throw new APIError("There are no homepage changes to publish.", 409);
  return activate(ctx.req, draft, ctx.user.id);
}

export async function scheduleFrontPage(ctx: ScreenContext, input: { at?: unknown }) {
  requireEditor(ctx);
  // A newsroom-local time from the desk ("2026-11-10T06:00"), read in the newsroom's timezone, never the browser's.
  let at: Date | null = null;
  try {
    at = typeof input.at === "string" ? new Date(localToInstant(input.at, ctx.timeZone)) : null;
  } catch {
    at = null;
  }
  if (!at || Number.isNaN(at.getTime())) throw new APIError("Choose when the homepage should change.", 400);
  if (at.getTime() < Date.now() + 60_000) throw new APIError("Choose a time in the future.", 400);
  const draft = await revisionIn(ctx.req, "draft");
  if (!draft) throw new APIError("There are no homepage changes to schedule.", 409);
  if (await revisionIn(ctx.req, "scheduled")) throw new APIError("A homepage change is already scheduled. Cancel it first.", 409);
  const issues = await issuesFor(ctx.req, draft.placements);
  if (issues.length) throw new APIError(issues.map(describeIssue).join(" "), 409);
  await ctx.req.payload.update({ collection: "front-page-revisions", id: draft.id, data: { state: "scheduled", scheduledAt: at.toISOString(), failure: null }, ...system(ctx.req) });
  // Activation is a job at that moment: the public renderer never decides with Date.now() which lineup is live.
  await (ctx.req.payload.jobs as unknown as { queue: (args: Record<string, unknown>) => Promise<unknown> }).queue({ task: FRONT_PAGE_TASK, queue: PUBLICATION_QUEUE, input: { revisionId: draft.id, at: at.toISOString() }, waitUntil: at, overrideAccess: true, req: ctx.req });
  return { scheduledAt: at.toISOString() };
}

export async function cancelScheduledFrontPage(ctx: ScreenContext) {
  requireEditor(ctx);
  const scheduled = await revisionIn(ctx.req, "scheduled");
  if (!scheduled) return { cancelled: false };
  // Back to the pending draft, unless someone has started a newer one.
  const draft = await revisionIn(ctx.req, "draft");
  await ctx.req.payload.update({ collection: "front-page-revisions", id: scheduled.id, data: draft ? { state: "archived", scheduledAt: null, summary: "Cancelled scheduled change" } : { state: "draft", scheduledAt: null }, ...system(ctx.req) });
  return { cancelled: true };
}

/** "Use this lineup": a new draft from a historical revision. History itself never changes. */
export async function useLineup(ctx: ScreenContext, revisionId: number) {
  requireEditor(ctx);
  const source = await ctx.req.payload.findByID({ collection: "front-page-revisions", id: revisionId, ...system(ctx.req) });
  const draft = await ensureDraft(ctx);
  await ctx.req.payload.update({ collection: "front-page-revisions", id: draft.id, data: { placements: cleanPlacements(source.placements), basedOn: source.id }, ...system(ctx.req) });
  return { draftId: draft.id };
}

/** Lightweight published Story summaries for the Story pool: never bodies. */
export async function frontPageStoryPool(ctx: ScreenContext, query: { search?: string; section?: string }) {
  requireEditor(ctx);
  const publication = publicationConfigFromGlobal(await readPublishedPublication(ctx.req.payload, ctx.req), 0);
  const search = (query.search ?? "").trim().toLowerCase();
  const stories = (await publishedHomepageStories(ctx.req.payload, publication, ctx.req))
    .filter((story) => (!query.section || story.sectionSlug === query.section) && (!search || story.headline.toLowerCase().includes(search)))
    .slice(0, 40);
  return {
    stories: stories.map((story) => ({ id: story.input.id, headline: story.headline, section: story.section, sectionSlug: story.sectionSlug, publishedAt: story.publishedAt, thumbnail: story.thumbnail })),
    sections: publication.sections.filter((section) => section.active).map((section) => ({ slug: section.slug, name: section.name }))
  };
}

/* ------------------------------------------------------ from a Story */

/** A Story's homepage status and the slots it may be featured in. */
export async function storyFrontPage(ctx: ScreenContext, storyId: number) {
  const { req } = ctx;
  const [active, draft] = await Promise.all([revisionIn(req, "active"), revisionIn(req, "draft")]);
  const slots = homepageSlots(homeDesign());
  const slotOf = (placements: Record<string, number> | undefined) => Object.entries(placements ?? {}).find(([, story]) => story === storyId)?.[0] ?? null;
  const live = slotOf(active?.placements);
  const pending = draft ? slotOf(draft.placements) : live;
  const occupied = draft?.placements ?? active?.placements ?? {};
  const occupants = [...new Set(slots.filter((slot) => slot.featured).map((slot) => occupied[slot.id]).filter(Boolean))];
  const headlines = occupants.length ? new Map((await req.payload.find({ collection: "stories", where: { id: { in: occupants } }, draft: false, pagination: false, select: { headline: true }, ...system(req) })).docs.map((row) => [row.id, row.headline])) : new Map<number, string>();
  const label = (id: string | null) => (id ? slots.find((slot) => slot.id === id)?.label ?? id : null);
  return {
    canFeature: atLeast(ctx.user, "editor"),
    live: label(live),
    pending: pending === live ? null : { slot: pending, label: label(pending) },
    featured: slots.filter((slot) => slot.featured).map((slot) => ({ id: slot.id, label: slot.label, currently: occupied[slot.id] && occupied[slot.id] !== storyId ? headlines.get(occupied[slot.id]) ?? "Another story" : null }))
  };
}

/** "Feature on homepage…" from a Story: the same pending change as the desk, never separate placement logic. */
export async function featureStory(ctx: ScreenContext, storyId: number, input: { slot?: unknown }) {
  const result = await setPlacement(ctx, { slot: input.slot, storyId });
  return { ...result, pending: true };
}

/* --------------------------------------------------------- scheduled job */

export const activateFrontPageTask: TaskConfig = {
  slug: FRONT_PAGE_TASK,
  label: "Activate a scheduled homepage change",
  inputSchema: [{ name: "revisionId", type: "number", required: true }, { name: "at", type: "text" }],
  retries: { attempts: 2 },
  handler: async ({ input, req: jobReq }) => {
    const req = await createLocalReq({}, jobReq.payload);
    const id = Number((input as { revisionId?: unknown }).revisionId);
    const found = await req.payload.find({ collection: "front-page-revisions", where: { id: { equals: id } }, limit: 1, ...system(req) });
    const row = found.docs[0];
    // Cancelled, rescheduled or already activated: nothing to do.
    if (!row || row.state !== "scheduled" || String(row.scheduledAt ?? "") !== String((input as { at?: unknown }).at ?? row.scheduledAt)) return { output: { skipped: true } };
    try {
      const result = await activate(req, { ...row, placements: cleanPlacements(row.placements) } as Revision, relationId(row.createdBy));
      return { output: result };
    } catch (error) {
      const message = (error as Error).message.slice(0, 400);
      // The change stays scheduled with its failure for an editor to fix; nothing public changed.
      await req.payload.update({ collection: "front-page-revisions", id, data: { failure: message }, ...system(req) });
      await notify(req, { kind: "frontPageFailures", recipients: await editorRecipients(req), detail: message.slice(0, 180), actor: null, dedupe: `front-page:${id}:${row.scheduledAt}` });
      return { output: { failed: true } };
    }
  }
};
