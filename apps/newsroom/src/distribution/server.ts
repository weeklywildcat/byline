import { GAP_LABELS, mediaKind } from "@byline/newsroom-screens/media/media-library-model";
import { APIError, type PayloadRequest, type Where } from "payload";
import { scopeManages, storyScope, type StoryScope } from "../access/story-context";
import { atLeast, relationId, sameId, type NewsroomUser } from "../access/user";
import { instantToLocal, localDay, localToInstant } from "../domain/dates";
import { editorRecipients, notify } from "../newsroom/notifications";
import type { ScreenContext } from "../newsroom/screen-models";
import { recordStoryActivity } from "../newsroom/story-activity";
import { publicStoryFacts, type PublicStoryFacts } from "../newsroom/story-distribution";
import { mediaMetadataGapsForRequirement } from "../publication-media/readiness";
import { adapterFor } from "./adapters";
import { DESTINATION_KINDS, DESTINATIONS, isDestinationKind, permalinkPlaceholder, validatePermalink, type DestinationKind } from "./destinations";
import {
  attentionReason, contentSummary, copyText, distributionProblems, effectiveContent, isDistributionState, needsApproval, nextAction, policyFor, sentHistory, sentSnapshot, stateLabel, transitionProblem,
  type DestinationSetting, type DistributionLevel, type DistributionRecord, type DistributionSettings, type DistributionState, type MediaMode, type Problem, type SentSnapshot, type SlotMode
} from "./model";
import { readDistributionSettings } from "./settings";

/**
 * Distribution's server (docs/distribution.md): the Story-level view, the
 * global desk, one item's detail, and every change. All writes happen here,
 * as the system, after checking the person; the collection's REST API is
 * read-only. Notifications and Story activity are recorded for real
 * editorial events only (assigned, ready, posted, skipped, failed), never
 * for a caption edit, a copy or an opened sheet.
 */

const COLLECTION = "distribution-items";
const PENDING: readonly DistributionState[] = ["planned", "draft", "ready", "scheduled", "failed"];
const system = (req: PayloadRequest) => ({ req, depth: 0, overrideAccess: true as const });
const asUser = (ctx: ScreenContext) => ({ req: ctx.req, depth: 0, overrideAccess: false as const });
const isoOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const num = (value: unknown): number | null => {
  const id = Number(relationId(value));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

type Row = {
  id: number; story: unknown; destination: string; expectation?: string | null; state?: string | null; owner?: unknown;
  headlineMode?: string | null; headline?: string | null; textMode?: string | null; text?: string | null; mediaMode?: string | null; media?: unknown;
  plannedFor?: string | null; scheduledFor?: string | null; note?: string | null; permalink?: string | null; postedAt?: string | null; postedBy?: unknown;
  approvedAt?: string | null; approvedBy?: unknown; sent?: unknown; failure?: string | null; failedAt?: string | null; updatedAt?: string; createdAt?: string;
};

function record(row: Row): DistributionRecord {
  return {
    kind: row.destination as DestinationKind,
    state: isDistributionState(row.state) ? row.state : "planned",
    expectation: (row.expectation === "eligible" || row.expectation === "optional" ? row.expectation : "prepare") as DistributionLevel,
    owner: num(row.owner),
    headlineMode: row.headlineMode === "custom" ? "custom" : "story",
    headline: row.headline ?? null,
    textMode: row.textMode === "custom" ? "custom" : "story",
    text: row.text ?? null,
    mediaMode: row.mediaMode === "custom" || row.mediaMode === "none" ? row.mediaMode : "story",
    media: num(row.media),
    plannedFor: isoOrNull(row.plannedFor),
    scheduledFor: isoOrNull(row.scheduledFor),
    permalink: row.permalink ?? null,
    approvedAt: isoOrNull(row.approvedAt),
    sent: sentHistory(row.sent),
    failure: row.failure ?? null
  };
}

/* --------------------------------------------------------------------- views */

export type PersonRef = { id: number; name: string };
export type DistributionSlotView = { label: string; mode: SlotMode; custom: string; inherited: string; max: number; required: boolean; multiline: boolean };
export type DistributionCan = { edit: boolean; annotate: boolean; assign: boolean; claim: boolean; approve: boolean; skip: boolean; reopen: boolean; restore: boolean; post: boolean };

export type DistributionItemView = {
  id: number;
  storyId: number;
  story: { headline: string; url: string | null; published: boolean; everPublished: boolean; section: string | null };
  kind: DestinationKind;
  label: string;
  expectation: DistributionLevel;
  state: DistributionState;
  stateLabel: string;
  owner: PersonRef | null;
  summary: string;
  headline: DistributionSlotView | null;
  text: DistributionSlotView | null;
  media: { use: "required" | "optional"; mode: MediaMode; customId: number | null; featuredId: number | null; effectiveId: number | null } | null;
  effective: { headline: string | null; text: string | null; url: string | null; copy: string };
  plannedFor: string | null;
  plannedForLocal: string;
  scheduledFor: string | null;
  scheduledForLocal: string;
  note: string;
  permalink: string | null;
  postedAt: string | null;
  postedBy: PersonRef | null;
  approvedAt: string | null;
  approvedBy: PersonRef | null;
  requiresApproval: boolean;
  failure: string | null;
  sent: Array<SentSnapshot & { byName: string | null }>;
  problems: Problem[];
  attention: string | null;
  nextAction: string;
  destination: { permalink: "required" | "optional" | "none"; placeholder: string; supportsScheduling: boolean; openUrl: string | null; verb: string; postedLabel: string; automated: boolean };
  can: DistributionCan;
  updatedAt: string;
};

type ViewContext = {
  ctx: ScreenContext;
  settings: DistributionSettings;
  scope: StoryScope | null;
  facts: Map<number, PublicStoryFacts>;
  people: Map<number, string>;
  mediaIssues: Map<number, string[]>;
  sections: Map<number, string>;
};

/** Normal Media checks on the images Distribution would use: exists, is an image, has the metadata a publication needs. */
async function mediaIssuesFor(req: PayloadRequest, ids: Iterable<number>): Promise<Map<number, string[]>> {
  const unique = [...new Set(ids)];
  const result = new Map<number, string[]>();
  if (!unique.length) return result;
  const { docs } = await req.payload.find({ collection: "media", where: { id: { in: unique } }, pagination: false, select: { alt: true, credit: true, creator: true, copyright: true, license: true, sourceUrl: true, mimeType: true, filename: true }, ...system(req) });
  const found = new Map(docs.map((media) => [media.id, media]));
  for (const id of unique) {
    const media = found.get(id);
    if (!media) { result.set(id, ["The image is no longer in Media."]); continue; }
    if (mediaKind(media.mimeType) !== "image") { result.set(id, ["Choose a photo or graphic."]); continue; }
    const name = media.filename ?? "The image";
    result.set(id, mediaMetadataGapsForRequirement(media, { id, role: "image" }).map((gap) => `${name} · ${GAP_LABELS[gap]}`));
  }
  return result;
}

async function namesFor(req: PayloadRequest, ids: Iterable<number | null>): Promise<Map<number, string>> {
  const unique = [...new Set([...ids].filter((id): id is number => id !== null))];
  if (!unique.length) return new Map();
  const { docs } = await req.payload.find({ collection: "users", where: { id: { in: unique } }, pagination: false, select: { name: true }, ...system(req) });
  return new Map(docs.map((user) => [user.id, user.name ?? "Unnamed account"]));
}

async function sectionNames(req: PayloadRequest, ids: Iterable<number | null>): Promise<Map<number, string>> {
  const unique = [...new Set([...ids].filter((id): id is number => id !== null))];
  if (!unique.length) return new Map();
  const { docs } = await req.payload.find({ collection: "sections", where: { id: { in: unique } }, pagination: false, select: { name: true }, ...system(req) });
  return new Map(docs.map((section) => [section.id, section.name ?? ""]));
}

async function viewContext(ctx: ScreenContext, rows: readonly Row[], extra: { settings?: DistributionSettings; scope?: StoryScope | null } = {}): Promise<ViewContext> {
  const { req } = ctx;
  const [settings, scope, facts] = await Promise.all([
    extra.settings ?? readDistributionSettings(req),
    extra.scope !== undefined ? extra.scope : storyScope(req),
    publicStoryFacts(req, rows.map((row) => num(row.story)).filter((id): id is number => id !== null))
  ]);
  const media = rows.flatMap((row) => {
    const story = facts.get(num(row.story) ?? 0);
    return story ? [effectiveContent(record(row), story).mediaId] : [];
  }).filter((id): id is number => id !== null);
  const people = rows.flatMap((row) => [num(row.owner), num(row.postedBy), num(row.approvedBy), ...sentHistory(row.sent).map((entry) => entry.by)]);
  const [mediaIssues, names, sections] = await Promise.all([mediaIssuesFor(req, media), namesFor(req, people), sectionNames(req, [...facts.values()].map((story) => story.section))]);
  return { ctx, settings, scope, facts, people: names, mediaIssues, sections };
}

function capabilities(user: NewsroomUser, scope: StoryScope | null, rec: DistributionRecord, storyId: number, setting: DestinationSetting, problems: readonly Problem[]): DistributionCan {
  const editor = atLeast(user, "editor");
  const own = rec.owner !== null && sameId(rec.owner, user.id);
  const manager = scopeManages(scope, storyId);
  const pending = rec.state !== "posted" && rec.state !== "skipped";
  const edit = pending && (editor || own || (manager && rec.owner === null));
  return {
    edit,
    annotate: editor || own || (manager && rec.owner === null),
    assign: editor && pending,
    claim: !editor && pending && manager && rec.owner === null,
    approve: editor && rec.state === "ready" && setting.requiresApproval && !rec.approvedAt,
    skip: editor && pending,
    reopen: editor && rec.state === "posted",
    restore: editor && rec.state === "skipped",
    post: edit && rec.state !== "failed" && !needsApproval(setting, rec, { editor }) && !problems.length
  };
}

function itemView(view: ViewContext, row: Row): DistributionItemView | null {
  const storyId = num(row.story);
  const story = storyId === null ? undefined : view.facts.get(storyId);
  if (!isDestinationKind(row.destination) || storyId === null || !story) return null;
  const rec = record(row);
  const descriptor = DESTINATIONS[rec.kind];
  const setting = view.settings.destinations[rec.kind];
  const effective = effectiveContent(rec, story);
  const problems = rec.state === "posted" || rec.state === "skipped" ? [] : distributionProblems(rec, effective, story, effective.mediaId === null ? [] : view.mediaIssues.get(effective.mediaId) ?? []);
  const person = (id: number | null) => (id === null ? null : { id, name: view.people.get(id) ?? "Former account" });
  const slot = (definition: typeof descriptor.text, mode: SlotMode, custom: string | null): DistributionSlotView | null => definition
    ? { label: definition.label, mode, custom: custom ?? "", inherited: definition.inherit(story), max: definition.max, required: definition.required, multiline: definition.multiline }
    : null;
  const { timeZone, now } = view.ctx;
  return {
    id: row.id, storyId,
    story: { headline: story.headline, url: story.url, published: story.published, everPublished: story.everPublished, section: story.section === null ? null : view.sections.get(story.section) ?? null },
    kind: rec.kind, label: setting.label, expectation: rec.expectation,
    state: rec.state, stateLabel: stateLabel(rec.state, rec.kind),
    owner: person(rec.owner),
    summary: contentSummary(rec),
    headline: slot(descriptor.headline, rec.headlineMode, rec.headline),
    text: slot(descriptor.text, rec.textMode, rec.text),
    media: descriptor.media === "none" ? null : { use: descriptor.media, mode: rec.mediaMode, customId: rec.media, featuredId: story.featuredMedia, effectiveId: effective.mediaId },
    effective: { headline: effective.headline, text: effective.text, url: effective.url, copy: copyText(rec.kind, effective) },
    plannedFor: rec.plannedFor, plannedForLocal: rec.plannedFor ? instantToLocal(rec.plannedFor, timeZone) : "",
    scheduledFor: rec.scheduledFor, scheduledForLocal: rec.scheduledFor ? instantToLocal(rec.scheduledFor, timeZone) : "",
    note: row.note ?? "",
    permalink: rec.permalink,
    postedAt: isoOrNull(row.postedAt), postedBy: person(num(row.postedBy)),
    approvedAt: rec.approvedAt, approvedBy: person(num(row.approvedBy)),
    requiresApproval: setting.requiresApproval,
    failure: rec.state === "failed" ? rec.failure : null,
    sent: rec.sent.map((entry) => ({ ...entry, byName: entry.by === null ? null : view.people.get(entry.by) ?? null })).reverse(),
    problems,
    attention: attentionReason(rec, problems, { now: now.getTime(), requiresApproval: setting.requiresApproval }),
    nextAction: nextAction(rec, setting.requiresApproval),
    destination: {
      permalink: descriptor.permalink === "none" ? "none" : descriptor.requiresPermalink ? "required" : "optional",
      placeholder: descriptor.permalink === "none" ? "" : permalinkPlaceholder(rec.kind),
      supportsScheduling: descriptor.supportsScheduling,
      openUrl: setting.accountUrl ?? descriptor.home,
      verb: descriptor.verb, postedLabel: descriptor.postedLabel,
      automated: adapterFor(rec.kind) !== null
    },
    can: capabilities(view.ctx.user, view.scope, rec, storyId, setting, problems),
    updatedAt: String(row.updatedAt ?? "")
  };
}

/** The enabled accounts an editor can make owners (a small newsroom: a bounded, local list). */
async function ownerOptions(req: PayloadRequest): Promise<PersonRef[]> {
  const { docs } = await req.payload.find({ collection: "users", where: { enabled: { equals: true } }, pagination: false, sort: "name", select: { name: true }, ...system(req) });
  return docs.map((user) => ({ id: user.id, name: user.name ?? "Unnamed account" }));
}

async function readRow(ctx: ScreenContext, id: number): Promise<Row> {
  const { docs } = await ctx.req.payload.find({ collection: COLLECTION, where: { id: { equals: id } }, limit: 1, ...asUser(ctx) });
  const row = docs[0] as Row | undefined;
  if (!row) throw new APIError("That distribution isn't available.", 404);
  return row;
}

/** One item with what its Sheet needs. */
export async function distributionItem(ctx: ScreenContext, id: number): Promise<DistributionItemView & { owners: PersonRef[] }> {
  const row = await readRow(ctx, id);
  const view = itemView(await viewContext(ctx, [row]), row);
  if (!view) throw new APIError("That distribution's Story isn't available.", 404);
  return { ...view, owners: view.can.assign ? await ownerOptions(ctx.req) : [] };
}

/* ------------------------------------------------------------- Story level */

export type StoryDistributionView = {
  story: { id: number; headline: string; published: boolean; everPublished: boolean; url: string | null };
  /** Generic utility copies; destination copies come from each item's effective content. */
  copy: { headline: string; excerpt: string; canonicalUrl: string | null };
  items: DistributionItemView[];
  /** Expected by policy but not created: before first publication what will be prepared, later the optional ones. */
  suggestions: Array<{ kind: DestinationKind; label: string; level: DistributionLevel }>;
  addable: Array<{ kind: DestinationKind; label: string }>;
  canAdd: boolean;
};

export async function storyDistributionView(ctx: ScreenContext, storyId: number): Promise<StoryDistributionView> {
  const { req } = ctx;
  // Whoever can open the Story may see where it is going (access is the Story's own).
  await req.payload.findByID({ collection: "stories", id: storyId, draft: true, depth: 0, select: { headline: true }, overrideAccess: false, req }).catch(() => {
    throw new APIError("That story isn't available.", 404);
  });
  const [{ docs }, settings, scope, plan] = await Promise.all([
    req.payload.find({ collection: COLLECTION, where: { story: { equals: storyId } }, pagination: false, sort: "id", ...asUser(ctx) }),
    readDistributionSettings(req),
    storyScope(req),
    req.payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, select: { preset: true }, ...system(req) }).then((found) => found.docs[0])
  ]);
  const rows = docs as Row[];
  const view = await viewContext(ctx, rows, { settings, scope });
  const facts = view.facts.get(storyId) ?? (await publicStoryFacts(req, [storyId])).get(storyId);
  if (!facts) throw new APIError("That story isn't available.", 404);
  const items = rows.map((row) => itemView(view, row)).filter((item): item is DistributionItemView => item !== null);
  const existing = new Set(rows.map((row) => row.destination));
  const expected = policyFor(settings, { preset: plan?.preset ?? null, section: facts.section });
  const suggestions = expected.filter((entry) => !existing.has(entry.kind) && (!facts.everPublished || entry.level === "optional" || !rows.length)).map((entry) => ({ ...entry, label: settings.destinations[entry.kind].label }));
  const suggested = new Set(suggestions.map((entry) => entry.kind));
  const editor = atLeast(ctx.user, "editor");
  return {
    story: { id: storyId, headline: facts.headline, published: facts.published, everPublished: facts.everPublished, url: facts.url },
    copy: { headline: facts.headline, excerpt: facts.deck, canonicalUrl: facts.url },
    items,
    suggestions,
    addable: DESTINATION_KINDS.filter((kind) => settings.destinations[kind].enabled && !existing.has(kind) && !suggested.has(kind)).map((kind) => ({ kind, label: settings.destinations[kind].label })),
    canAdd: facts.published && (editor || scopeManages(scope, storyId))
  };
}

/** Adds an enabled destination the policy did not create (or an optional one). Never a duplicate. */
export async function addDistribution(ctx: ScreenContext, storyId: number, input: { destination?: unknown }): Promise<DistributionItemView> {
  const { req } = ctx;
  const kind = input.destination;
  if (!isDestinationKind(kind)) throw new APIError("Choose a destination.", 400);
  const current = await storyDistributionView(ctx, storyId);
  if (!current.canAdd) throw new APIError(current.story.published ? "Only an editor or the Story's team can add a destination." : "Publish the Story before adding a destination.", current.story.published ? 403 : 409);
  const settings = await readDistributionSettings(req);
  if (!settings.destinations[kind].enabled) throw new APIError("That destination isn't enabled.", 400);
  if (current.items.some((item) => item.kind === kind)) throw new APIError(`${settings.destinations[kind].label} is already on this Story.`, 409);
  const level = current.suggestions.find((entry) => entry.kind === kind)?.level ?? "optional";
  const created = await req.payload.create({ collection: COLLECTION, data: { story: storyId, destination: kind, expectation: level, state: "planned", headlineMode: "story", textMode: "story", mediaMode: "story", createdBy: ctx.user.id as number }, ...system(req) });
  return (await distributionItem(ctx, created.id));
}

/* -------------------------------------------------------------------- changes */

export type DistributionPatch = {
  headlineMode?: SlotMode; headline?: string;
  textMode?: SlotMode; text?: string;
  mediaMode?: MediaMode; media?: number | null;
  note?: string;
  /** Newsroom-local wall time ("2026-11-10T09:00"), or null to clear. */
  plannedFor?: string | null;
  scheduledFor?: string | null;
  owner?: number | null;
  state?: DistributionState;
  approve?: boolean;
  /** The final post's address: valid means Posted (no separate step). */
  permalink?: string;
};

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

function localInstant(value: unknown, timeZone: string): string | null {
  if (value === null || value === "") return null;
  try {
    return localToInstant(String(value), timeZone);
  } catch (error) {
    throw new APIError((error as Error).message, 400);
  }
}

export async function updateDistribution(ctx: ScreenContext, id: number, patch: DistributionPatch): Promise<DistributionItemView> {
  const { req, user } = ctx;
  const { payload } = req;
  const row = await readRow(ctx, id);
  const storyId = num(row.story)!;
  const view = await viewContext(ctx, [row]);
  const story = view.facts.get(storyId);
  if (!story || !isDestinationKind(row.destination)) throw new APIError("That distribution's Story isn't available.", 409);
  const before = record(row);
  const kind = before.kind;
  const descriptor = DESTINATIONS[kind];
  const setting = view.settings.destinations[kind];
  const editor = atLeast(user, "editor");
  const can = capabilities(user, view.scope, before, storyId, setting, []);
  const forbid = (message = "You can't change this distribution.") => { throw new APIError(message, 403); };
  const data: Record<string, unknown> = {};
  const next: DistributionRecord = { ...before };
  const after: Array<() => Promise<unknown>> = [];
  const label = setting.label;
  const notice = { story: storyId, detail: label, data: { tab: "history", distribution: id } };

  /* content: a slot inherits until someone chooses Custom, and only that slot diverges */
  const contentKeys = ["headlineMode", "headline", "textMode", "text", "mediaMode", "media"] as const;
  if (contentKeys.some((key) => key in patch)) {
    if (!can.edit) forbid();
    for (const [modeKey, valueKey, slot] of [["headlineMode", "headline", descriptor.headline], ["textMode", "text", descriptor.text]] as const) {
      if (!slot) continue;
      if (modeKey in patch) {
        if (patch[modeKey] !== "story" && patch[modeKey] !== "custom") throw new APIError("Choose Story or Custom.", 400);
        data[modeKey] = next[modeKey] = patch[modeKey]!;
      }
      if (valueKey in patch) data[valueKey] = next[valueKey] = clip(patch[valueKey], slot.multiline ? 5000 : 300);
    }
    if (descriptor.media !== "none") {
      if ("mediaMode" in patch) {
        const mode = patch.mediaMode;
        if (mode !== "story" && mode !== "custom" && !(mode === "none" && descriptor.media === "optional")) throw new APIError("Choose an image option.", 400);
        data.mediaMode = next.mediaMode = mode;
      }
      if ("media" in patch) {
        const mediaId = patch.media === null ? null : num(patch.media);
        if (patch.media !== null && mediaId === null) throw new APIError("Choose an image from Media.", 400);
        if (mediaId !== null && !(await payload.find({ collection: "media", where: { id: { equals: mediaId } }, limit: 1, select: {}, ...system(req) })).docs.length) throw new APIError("That image is no longer in Media.", 400);
        data.media = next.media = mediaId;
      }
    }
    if (before.state === "planned") data.state = next.state = "draft";
    // Approval covers the content an editor saw; a later change by someone else needs it again.
    if (before.approvedAt && !editor) { data.approvedAt = next.approvedAt = null; data.approvedBy = null; }
  }
  if ("note" in patch) {
    if (!can.annotate) forbid();
    data.note = clip(patch.note, 2000);
  }
  if ("plannedFor" in patch) {
    if (!can.edit) forbid();
    data.plannedFor = next.plannedFor = localInstant(patch.plannedFor, ctx.timeZone);
  }

  /* owner: editors assign; a Story's team member may take unowned work */
  if ("owner" in patch) {
    const owner = patch.owner === null ? null : num(patch.owner);
    if (patch.owner !== null && owner === null) throw new APIError("Choose an account.", 400);
    if (!(can.assign || (can.claim && owner !== null && sameId(owner, user.id)))) forbid("Only an editor can assign distribution work.");
    if (owner !== null && !(await payload.find({ collection: "users", where: { and: [{ id: { equals: owner } }, { enabled: { equals: true } }] }, limit: 1, select: {}, ...system(req) })).docs.length) throw new APIError("That account can't own distribution work.", 400);
    if (!sameId(owner, before.owner)) {
      data.owner = next.owner = owner;
      if (owner !== null) {
        after.push(() => notify(req, { kind: "distributionAssignments", recipients: [owner], ...notice }));
        after.push(() => recordStoryActivity(req, storyId, "distribution-assigned", id));
      }
    }
  }

  if (patch.approve) {
    if (!editor) forbid("Only an editor can approve distribution work.");
    if (before.state !== "ready") throw new APIError("Only Ready work can be approved.", 409);
    data.approvedAt = next.approvedAt = ctx.now.toISOString();
    data.approvedBy = user.id;
  }

  /* state; a valid final address is what makes it Posted */
  let target = patch.state;
  if (target !== undefined && !isDistributionState(target)) throw new APIError("Unknown state.", 400);
  if ("permalink" in patch) {
    if (descriptor.permalink === "none") throw new APIError(`${label} has no final address.`, 400);
    if (before.state === "posted") throw new APIError("This already went out. Reopen it to record a new post.", 409);
    const result = validatePermalink(kind, patch.permalink);
    if (!result.ok) throw new APIError(result.message, 422);
    data.permalink = next.permalink = result.url;
    target = "posted";
  }
  if ("scheduledFor" in patch) {
    if (!can.edit) forbid();
    data.scheduledFor = next.scheduledFor = localInstant(patch.scheduledFor, ctx.timeZone);
  }
  if (target !== undefined && target !== before.state) {
    const problem = transitionProblem(before.state, target, { editor });
    if (problem) throw new APIError(problem, editor || !problem.startsWith("Only") ? 409 : 403);
    if (!editor && !can.edit) forbid();
    const effective = effectiveContent(next, story);
    const problems = distributionProblems(next, effective, story, effective.mediaId === null ? [] : (await mediaIssuesFor(req, [effective.mediaId])).get(effective.mediaId) ?? []);
    const blocking = (...kinds: Array<Problem["blocks"]>) => problems.find((entry) => kinds.includes(entry.blocks));
    const goingOut = target === "posted" || target === "scheduled";
    if (target === "ready" || goingOut) {
      const blocker = blocking("ready", ...(goingOut ? (["post"] as const) : []));
      if (blocker) throw new APIError(blocker.message, 409);
    }
    if (goingOut && needsApproval(setting, next, { editor })) throw new APIError("An editor needs to approve this first.", 409);
    data.state = next.state = target;
    switch (target) {
      case "ready":
        data.failure = null;
        if (editor) { data.approvedAt = ctx.now.toISOString(); data.approvedBy = user.id; }
        else if (setting.requiresApproval) after.push(async () => notify(req, { kind: "distributionApproval", recipients: await editorRecipients(req), ...notice }));
        after.push(() => recordStoryActivity(req, storyId, "distribution-ready", id));
        break;
      case "scheduled":
        if (!descriptor.supportsScheduling) throw new APIError(`${label} can't be scheduled.`, 409);
        if (!next.scheduledFor) throw new APIError("Choose when it is scheduled to go out.", 400);
        break;
      case "posted": {
        if (descriptor.requiresPermalink && !next.permalink) throw new APIError(`Paste the ${label} address to record it as ${descriptor.postedLabel.toLowerCase()}.`, 422);
        const at = ctx.now.toISOString();
        data.postedAt = at;
        data.postedBy = user.id;
        data.failure = null;
        // Freeze what actually went out; earlier snapshots are never rewritten.
        data.sent = [...before.sent, sentSnapshot(next, effective, { at, by: Number(user.id), label, permalink: next.permalink })];
        after.push(() => recordStoryActivity(req, storyId, "distribution-posted", id));
        break;
      }
      case "draft":
        // Back for more work: approval is for the version an editor saw. Reopening keeps every snapshot.
        data.approvedAt = null; data.approvedBy = null;
        if (before.state === "posted") { data.permalink = null; data.postedAt = null; data.postedBy = null; }
        if (before.state === "failed") data.failure = null;
        break;
      case "skipped":
        after.push(() => recordStoryActivity(req, storyId, "distribution-skipped", id));
        break;
      default:
        break;
    }
  }

  if (Object.keys(data).length) await payload.update({ collection: COLLECTION, id, data, ...system(req) });
  for (const run of after) await run();
  return (await distributionItem(ctx, id));
}

/**
 * Delivery failure from an automated destination (`adapters.ts`): the item
 * becomes Failed, its owner and the editors are notified, and the Story
 * records it. Manual work never fails just because nobody has posted yet.
 */
export async function markDistributionFailed(req: PayloadRequest, id: number, reason: string): Promise<boolean> {
  const { payload } = req;
  const row = (await payload.find({ collection: COLLECTION, where: { id: { equals: id } }, limit: 1, ...system(req) })).docs[0] as Row | undefined;
  if (!row || !isDestinationKind(row.destination) || !PENDING.includes(record(row).state) || record(row).state === "failed") return false;
  const failedAt = new Date().toISOString();
  await payload.update({ collection: COLLECTION, id, data: { state: "failed", failure: reason.slice(0, 400), failedAt }, ...system(req) });
  const settings = await readDistributionSettings(req);
  const storyId = num(row.story);
  await notify(req, {
    kind: "distributionFailures", recipients: [num(row.owner), ...(await editorRecipients(req))].filter((value) => value !== null), actor: null,
    story: storyId, detail: settings.destinations[row.destination].label, data: { tab: "history", distribution: id }, dedupe: `distribution-failed:${id}:${failedAt}`
  });
  await recordStoryActivity(req, storyId, "distribution-failed", id);
  return true;
}

/* ----------------------------------------------------------------------- desk */

export const DESK_VIEWS = ["attention", "drafts", "ready", "scheduled", "posted"] as const;
export type DeskView = (typeof DESK_VIEWS)[number];
export type DeskWhen = "" | "today" | "week" | "past-week";
export type DeskFilters = { view?: string; destination?: string; owner?: string; section?: string; q?: string; when?: string };

export type DeskRow = {
  id: number; storyId: number; story: string; section: string | null; published: boolean;
  kind: DestinationKind; label: string; state: DistributionState; stateLabel: string;
  owner: PersonRef | null; time: { label: string; at: string } | null; attention: string | null; nextAction: string;
};

export type DistributionDeskPayload = {
  view: DeskView;
  rows: DeskRow[];
  counts: Record<DeskView, number>;
  /** Posted is the newest 200; older ones are on their Stories. */
  truncated: boolean;
  destinations: Array<{ kind: DestinationKind; label: string }>;
  owners: PersonRef[];
  sections: Array<{ id: number; name: string }>;
};

const POSTED_LIMIT = 200;

function rowTime(item: DistributionItemView): DeskRow["time"] {
  if (item.state === "posted" && item.postedAt) return { label: item.destination.postedLabel, at: item.postedAt };
  if (item.state === "scheduled" && item.scheduledFor) return { label: "Scheduled", at: item.scheduledFor };
  if (item.plannedFor) return { label: "Planned", at: item.plannedFor };
  return null;
}

function inView(item: DistributionItemView, view: DeskView): boolean {
  switch (view) {
    case "attention": return item.attention !== null;
    case "drafts": return item.state === "planned" || item.state === "draft";
    case "ready": return item.state === "ready";
    case "scheduled": return item.state === "scheduled";
    case "posted": return item.state === "posted";
  }
}

/** The global desk (editors): what still needs to go out, and what did. */
export async function distributionDesk(ctx: ScreenContext, filters: DeskFilters): Promise<DistributionDeskPayload> {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can open the Distribution desk.", 403);
  const { req } = ctx;
  const { payload } = req;
  const view: DeskView = (DESK_VIEWS as readonly string[]).includes(String(filters.view)) ? (filters.view as DeskView) : "attention";
  const where: Where[] = [];
  if (isDestinationKind(filters.destination)) where.push({ destination: { equals: filters.destination } });
  if (filters.owner === "me") where.push({ owner: { equals: ctx.user.id } });
  else if (filters.owner === "none") where.push({ owner: { exists: false } });
  else if (num(filters.owner) !== null) where.push({ owner: { equals: num(filters.owner) } });
  const search = String(filters.q ?? "").trim().slice(0, 120);
  const section = num(filters.section);
  if (search || section !== null) {
    // Lightweight Story ids (never bodies) to narrow the items.
    const conditions: Where[] = [];
    if (search) conditions.push({ headline: { like: search } });
    if (section !== null) conditions.push({ section: { equals: section } });
    const { docs } = await payload.find({ collection: "stories", where: { and: conditions }, limit: 500, select: {}, ...system(req) });
    where.push({ story: { in: docs.length ? docs.map((story) => story.id) : [0] } });
  }
  const [pending, posted, settings] = await Promise.all([
    payload.find({ collection: COLLECTION, where: { and: [...where, { state: { in: [...PENDING] } }] }, pagination: false, ...asUser(ctx) }),
    payload.find({ collection: COLLECTION, where: { and: [...where, { state: { equals: "posted" } }] }, sort: "-postedAt", limit: POSTED_LIMIT, ...asUser(ctx) }),
    readDistributionSettings(req)
  ]);
  const rows = [...pending.docs, ...posted.docs] as Row[];
  const context = await viewContext(ctx, rows, { settings, scope: null });
  const when = (["today", "week", "past-week"] as const).find((value) => value === filters.when) ?? "";
  const today = localDay(ctx.now, ctx.timeZone);
  const inWindow = (item: DistributionItemView) => {
    if (!when) return true;
    const time = rowTime(item);
    if (!time) return false;
    const day = localDay(time.at, ctx.timeZone);
    const offset = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
    return when === "today" ? offset === 0 : when === "week" ? offset >= 0 && offset < 7 : offset <= 0 && offset > -7;
  };
  const items = rows.map((row) => itemView(context, row)).filter((item): item is DistributionItemView => item !== null && inWindow(item));
  const counts = Object.fromEntries(DESK_VIEWS.map((key) => [key, items.filter((item) => inView(item, key)).length])) as Record<DeskView, number>;
  if (!when && !search && section === null && where.length === 0) counts.posted = await payload.count({ collection: COLLECTION, where: { state: { equals: "posted" } }, ...asUser(ctx) }).then((found) => found.totalDocs);
  const order: Record<DeskView, (a: DistributionItemView, b: DistributionItemView) => number> = {
    attention: (a, b) => Number(b.state === "failed") - Number(a.state === "failed") || (a.plannedFor ?? "9").localeCompare(b.plannedFor ?? "9") || a.id - b.id,
    drafts: (a, b) => (a.plannedFor ?? "9").localeCompare(b.plannedFor ?? "9") || b.id - a.id,
    ready: (a, b) => (a.plannedFor ?? "9").localeCompare(b.plannedFor ?? "9") || a.id - b.id,
    scheduled: (a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""),
    posted: (a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")
  };
  const shown = items.filter((item) => inView(item, view)).sort(order[view]);
  const [owners, sectionRows] = await Promise.all([
    ownerOptions(req),
    payload.find({ collection: "sections", pagination: false, sort: "name", select: { name: true }, ...system(req) })
  ]);
  return {
    view,
    rows: shown.map((item) => ({
      id: item.id, storyId: item.storyId, story: item.story.headline, section: item.story.section, published: item.story.published,
      kind: item.kind, label: item.label, state: item.state, stateLabel: item.stateLabel, owner: item.owner, time: rowTime(item), attention: item.attention, nextAction: item.nextAction
    })),
    counts,
    truncated: posted.totalDocs > POSTED_LIMIT,
    destinations: DESTINATION_KINDS.filter((kind) => settings.destinations[kind].enabled || rows.some((row) => row.destination === kind)).map((kind) => ({ kind, label: settings.destinations[kind].label })),
    owners,
    sections: sectionRows.docs.map((row) => ({ id: row.id, name: row.name ?? "" }))
  };
}
