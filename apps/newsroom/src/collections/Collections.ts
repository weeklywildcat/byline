import { APIError, type Access, type CollectionBeforeChangeHook, type CollectionConfig, type FieldAccess, type PayloadRequest, type Where } from "payload";
import {
  collectionCanArchive,
  collectionCanManage,
  collectionCanManagePublic,
  collectionCanManageTeam,
  collectionScope,
  managedCollections,
  resetCollectionScope
} from "../access/collection-context";
import { administratorsOnly, atLeast, editorsOnly, editorsOnlyField, newsroomUser, relationId, relationIds, requestUser, sameId, signedIn } from "../access/user";
import { dateOnly, normalizeAppointmentTiming, TimingError } from "../domain/schedule";
import { isSlug, slugify } from "../domain/slug";
import {
  COLLECTION_STATUS_OPTIONS,
  COLLECTION_TYPE_OPTIONS,
  INTERVIEW_STATUS_OPTIONS,
  LIMITS,
  PUBLIC_PRESENTATION_FORMAT_OPTIONS,
  RESOURCE_KIND_OPTIONS,
  SCHEDULE_MODE_OPTIONS
} from "../domain/vocabulary";
import { legacyIdField } from "../fields/slug";
import { validResourceUrl } from "./StoryPlans";

/**
 * Collections: the private newsroom's reporting projects (docs/collections-workspace.md).
 *
 * A Collection is the newsroom object. It owns its brief, lead, team, dates
 * and, as an ordered `stories` list, its story membership: a story's
 * Collections are derived from that list and never stored on the story. Its
 * shared reporting lives in `collection-interviews` and `collection-resources`;
 * its work in the canonical `tasks` collection (`tasks.collection`).
 *
 * Public coverage or a series is only an optional presentation of a
 * Collection (`publicPresentation`), projected for the public site as the
 * native public Collections dataset. There is no second, public "Coverage" record.
 */

const system = (req: PayloadRequest) => req.context?.bylineImport === true || req.context?.bylineSystem === true;
const asSystem = (req: PayloadRequest) => ({ req, overrideAccess: true as const, context: { bylineSystem: true } });

/** Editors and the doc's lead change the team; field access keeps it out of a member's writes. */
const teamField: FieldAccess = async ({ req, doc }) => collectionCanManageTeam(await collectionScope(req), doc?.id);

const updateManaged: Access = async ({ req }) => {
  const scope = await collectionScope(req);
  return scope ? managedCollections(scope, "id") : false;
};

function idsEqual(a: unknown, b: unknown): boolean {
  const left = relationIds(a).map(String);
  const right = relationIds(b).map(String);
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

const unique = (ids: Array<number | string>) => ids.filter((id, index) => ids.findIndex((other) => sameId(other, id)) === index);

async function enabledUsers(req: PayloadRequest, ids: Array<number | string>): Promise<boolean> {
  if (!ids.length) return true;
  const found = await req.payload.find({ collection: "users", where: { and: [{ id: { in: ids } }, { enabled: { equals: true } }] }, depth: 0, pagination: false, select: { enabled: true }, ...asSystem(req) });
  return found.docs.length === ids.length;
}

type Presentation = {
  enabled?: boolean | null;
  format?: string | null;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  overview?: string | null;
  artwork?: unknown;
  featuredStory?: unknown;
  storyOrder?: unknown;
};

/** Plain public text: one line, or paragraphs separated by blank lines. Never HTML; the public site escapes it. */
export function plainPublicText(value: unknown, maximum: number, multiline = false): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const text = multiline
    ? normalized.split(/\n{2,}/).map((paragraph) => paragraph.split("\n").map((line) => line.trim()).join("\n").trim()).filter(Boolean).join("\n\n")
    : normalized.replace(/\s+/g, " ").trim();
  return [...text].slice(0, maximum).join("");
}

/** The overview as the public contract's `overviewParagraphs` (Astro renders each as a `<p>`). */
export function overviewParagraphs(overview: string | null | undefined): string[] {
  return plainPublicText(overview ?? "", LIMITS.publicOverview, true)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

const normalizeCollection: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const user = requestUser(req);
  const trusted = system(req);
  if (operation === "create") {
    data.createdBy = data.createdBy ?? user?.id ?? null;
    if (relationId(data.lead) === null && user) data.lead = user.id;
  }
  if (typeof data.name === "string") data.name = data.name.replace(/\s+/g, " ").trim().slice(0, LIMITS.collectionName);
  if (data.name !== undefined && !data.name) throw new APIError("Give the Collection a name.", 400);
  if (typeof data.brief === "string") data.brief = data.brief.replace(/\r\n?/g, "\n").slice(0, LIMITS.brief);

  // Calendar dates, never instants: no timezone can move them.
  try {
    for (const key of ["startDate", "endDate"] as const) if (data[key] !== undefined) data[key] = dateOnly(data[key]) || null;
  } catch (error) {
    throw new APIError(error instanceof TimingError ? error.message : "Use a date like 2026-11-12.", 400);
  }
  const start = data.startDate !== undefined ? data.startDate : originalDoc?.startDate;
  const end = data.endDate !== undefined ? data.endDate : originalDoc?.endDate;
  if (start && end && end < start) throw new APIError("The end date can't be before the start date.", 400);

  if (!trusted && originalDoc) {
    const archiving = data.status !== undefined && data.status !== originalDoc.status && (data.status === "archived" || originalDoc.status === "archived");
    if (archiving && !collectionCanArchive(user)) throw new APIError("Only an editor can archive or restore a Collection.", 403);
    const teamChanged = (data.lead !== undefined && !sameId(data.lead, originalDoc.lead)) || (data.members !== undefined && !idsEqual(data.members, originalDoc.members));
    if (teamChanged && !collectionCanManageTeam(await collectionScope(req), originalDoc.id)) throw new APIError("Only the Collection's lead or an editor can change its team.", 403);
  }

  if (data.members !== undefined) data.members = unique(relationIds(data.members)).filter((id) => !sameId(id, data.lead ?? originalDoc?.lead));
  const team = [relationId(data.lead !== undefined ? data.lead : originalDoc?.lead), ...relationIds(data.members !== undefined ? data.members : [])].filter((id): id is number | string => id !== null);
  if (!trusted && (data.lead !== undefined || data.members !== undefined) && !(await enabledUsers(req, unique(team)))) throw new APIError("Choose newsroom accounts for the lead and team.", 400);

  // Membership: unique and ordered; the public order and lead story can only name members.
  if (data.stories !== undefined) data.stories = unique(relationIds(data.stories));
  const stories = relationIds(data.stories !== undefined ? data.stories : originalDoc?.stories);
  const before = (originalDoc?.publicPresentation ?? {}) as Presentation;
  const asked = (data.publicPresentation ?? before) as Presentation;
  const explicit = !trusted && data.publicPresentation !== undefined && JSON.stringify(normalizePresentation(asked)) !== JSON.stringify(normalizePresentation(before));
  if (explicit && !collectionCanManagePublic(user)) throw new APIError("Only an editor can change a Collection's public presentation.", 403);
  const next = normalizePresentation(asked);
  const member = (id: unknown) => stories.some((story) => sameId(story, id));
  if (explicit && (next.storyOrder.some((id) => !member(id)) || (next.featuredStory !== null && !member(next.featuredStory)))) {
    throw new APIError("Choose stories that belong to this Collection.", 400);
  }
  // A story leaving the Collection leaves its public order and lead too.
  next.storyOrder = next.storyOrder.filter(member);
  if (next.featuredStory !== null && !member(next.featuredStory)) next.featuredStory = null;
  if (next.enabled && (!next.title || !next.slug)) throw new APIError("Add a public title and URL slug before making the Collection public.", 400);
  if (next.slug) {
    if (!isSlug(next.slug)) throw new APIError("Use lowercase letters, numbers and hyphens in the URL slug.", 400);
    const where: Where = { and: [{ "publicPresentation.slug": { equals: next.slug } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] };
    const { totalDocs } = await req.payload.count({ collection: "collections", where, ...asSystem(req) });
    if (totalDocs > 0) throw new APIError("That public URL is already used by another Collection.", 409);
  }
  if (next.artwork !== null && explicit) {
    const media = await req.payload.find({ collection: "media", where: { id: { equals: next.artwork } }, depth: 0, limit: 1, select: { mimeType: true }, ...asSystem(req) });
    if (!media.docs[0]?.mimeType?.startsWith("image/")) throw new APIError("Choose an image from Media for the artwork.", 400);
  }
  data.publicPresentation = next;
  return data;
};

function normalizePresentation(value: Presentation) {
  return {
    enabled: value.enabled === true,
    format: value.format === "series" ? "series" : "coverage",
    title: plainPublicText(value.title, LIMITS.publicTitle),
    slug: typeof value.slug === "string" && value.slug.trim() ? slugify(value.slug) || null : null,
    description: plainPublicText(value.description, LIMITS.publicDescription),
    overview: plainPublicText(value.overview, LIMITS.publicOverview, true),
    artwork: relationId(value.artwork),
    featuredStory: relationId(value.featuredStory),
    storyOrder: unique(relationIds(value.storyOrder))
  };
}

export const Collections: CollectionConfig = {
  slug: "collections",
  labels: { singular: "Collection", plural: "Collections" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "type", "status", "lead"],
    group: "Newsroom",
    listSearchableFields: ["name"],
    hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator")
  },
  access: { read: signedIn, create: editorsOnly, update: updateManaged, delete: administratorsOnly },
  hooks: {
    beforeChange: [normalizeCollection],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (operation === "create" || !sameId(doc.lead, previousDoc?.lead) || !idsEqual(doc.members, previousDoc?.members)) resetCollectionScope(req);
        if (operation !== "update") return doc;
        const removed = relationIds(previousDoc?.stories).filter((id) => !relationIds(doc.stories).some((story) => sameId(story, id)));
        if (removed.length) await detachStories(req, doc.id, removed);
        return doc;
      }
    ],
    beforeDelete: [
      async ({ id, req }) => {
        // Deleting is an administrator's last resort; the Collection's own reporting goes with it,
        // its stories' work stays with the stories, and shared resources only lose this link.
        await req.payload.delete({ collection: "collection-interviews", where: { collection: { equals: id } }, ...asSystem(req) });
        await req.payload.delete({ collection: "tasks", where: { and: [{ collection: { equals: id } }, { story: { exists: false } }] }, ...asSystem(req) });
        await req.payload.update({ collection: "tasks", where: { collection: { equals: id } }, data: { collection: null }, ...asSystem(req) });
        const resources = await req.payload.find({ collection: "collection-resources", where: { collections: { in: [id] } }, depth: 0, pagination: false, select: { collections: true }, ...asSystem(req) });
        for (const resource of resources.docs) {
          await req.payload.update({ collection: "collection-resources", id: resource.id, data: { collections: relationIds(resource.collections).filter((other) => !sameId(other, id)) as number[] }, ...asSystem(req) });
        }
      }
    ]
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: LIMITS.collectionName, index: true },
    { type: "row", fields: [
      { name: "type", type: "select", required: true, defaultValue: "other", options: [...COLLECTION_TYPE_OPTIONS] },
      { name: "status", type: "select", required: true, defaultValue: "planning", index: true, options: [...COLLECTION_STATUS_OPTIONS] }
    ] },
    { name: "brief", label: "Reporting brief", type: "textarea", maxLength: LIMITS.brief, admin: { description: "Private: what we're covering, why it matters, the angles, what's missing." } },
    { name: "lead", type: "relationship", relationTo: "users", index: true, access: { update: teamField } },
    { name: "members", label: "Team", type: "relationship", relationTo: "users", hasMany: true, index: true, access: { update: teamField } },
    { type: "row", fields: [
      // Calendar days (YYYY-MM-DD), never instants.
      { name: "startDate", type: "text", index: true, validate: validDay },
      { name: "endDate", label: "Target / end date", type: "text", validate: validDay }
    ] },
    { name: "stories", type: "relationship", relationTo: "stories", hasMany: true, index: true, admin: { description: "Membership. A story's Collections are derived from here." } },
    {
      name: "publicPresentation",
      label: "Public presentation",
      type: "group",
      access: { create: editorsOnlyField, update: editorsOnlyField },
      admin: { description: "Optional. A Collection is newsroom-only until an editor presents it as public coverage or a series." },
      fields: [
        { name: "enabled", label: "Public", type: "checkbox", defaultValue: false, index: true },
        { name: "format", type: "select", defaultValue: "coverage", options: [...PUBLIC_PRESENTATION_FORMAT_OPTIONS] },
        { name: "title", label: "Public title", type: "text", maxLength: LIMITS.publicTitle },
        { name: "slug", label: "URL slug", type: "text", unique: true, index: true, admin: { description: "/coverage/<slug>/" } },
        { name: "description", label: "Short description", type: "textarea", maxLength: LIMITS.publicDescription },
        { name: "overview", label: "Public overview", type: "textarea", maxLength: LIMITS.publicOverview, admin: { description: "Plain text. Separate paragraphs with a blank line." } },
        { name: "artwork", type: "upload", relationTo: "media" },
        { name: "featuredStory", label: "Lead story", type: "relationship", relationTo: "stories" },
        { name: "storyOrder", label: "Public story order", type: "relationship", relationTo: "stories", hasMany: true }
      ]
    },
    { name: "publicModifiedAt", type: "date", admin: { hidden: true }, access: { create: () => false, update: () => false } },
    { name: "createdBy", type: "relationship", relationTo: "users", admin: { readOnly: true }, access: { update: () => false } },
    legacyIdField()
  ]
};

function validDay(value: unknown): true | string {
  try {
    dateOnly(value);
    return true;
  } catch (error) {
    return (error as Error).message;
  }
}

/** A story removed from a Collection leaves the Collection's interviews and Collection tasks. */
async function detachStories(req: PayloadRequest, collectionId: number, storyIds: Array<number | string>) {
  const interviews = await req.payload.find({ collection: "collection-interviews", where: { and: [{ collection: { equals: collectionId } }, { stories: { in: storyIds } }] }, depth: 0, pagination: false, select: { stories: true }, ...asSystem(req) });
  for (const interview of interviews.docs) {
    await req.payload.update({ collection: "collection-interviews", id: interview.id, data: { stories: relationIds(interview.stories).filter((id) => !storyIds.some((story) => sameId(story, id))) as number[] }, ...asSystem(req) });
  }
  // The story's work stays with the story; it is no longer this Collection's work.
  await req.payload.update({ collection: "tasks", where: { and: [{ collection: { equals: collectionId } }, { story: { in: storyIds } }] }, data: { collection: null }, ...asSystem(req) });
}

/* ------------------------------------------------------------ interviews */

const collectionField = { name: "collection", type: "relationship", relationTo: "collections", required: true, index: true, access: { update: () => false } } as const;

const createInCollection: Access = async ({ req, data }) => {
  const scope = await collectionScope(req);
  if (!scope) return false;
  if (!data) return scope.all || scope.led.length + scope.member.length > 0;
  return collectionCanManage(scope, data.collection);
};

const managedRecords: Access = async ({ req }) => {
  const scope = await collectionScope(req);
  return scope ? managedCollections(scope, "collection") : false;
};

/** Private source details: the Collection's lead, team and editors only. */
const contactAccess: FieldAccess = async ({ req, doc, data }) => collectionCanManage(await collectionScope(req), doc?.collection ?? data?.collection);

async function collectionStories(req: PayloadRequest, collectionId: unknown): Promise<Array<number | string>> {
  const found = await req.payload.find({ collection: "collections", where: { id: { equals: relationId(collectionId) } }, depth: 0, limit: 1, select: { stories: true }, ...asSystem(req) });
  if (!found.docs[0]) throw new APIError("That Collection no longer exists.", 404);
  return relationIds(found.docs[0].stories);
}

const normalizeInterview: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (system(req) && req.context?.bylineImport === true) return data;
  const merged = { ...originalDoc, ...data };
  if (operation === "create") data.createdBy = data.createdBy ?? requestUser(req)?.id ?? null;
  if (typeof data.interviewee === "string") data.interviewee = data.interviewee.replace(/\s+/g, " ").trim();
  if (data.interviewee !== undefined && !data.interviewee) throw new APIError("Add an interviewee.", 400);
  // The same timing rules as a Story appointment: a window stays date-only, unscheduled has no date at all.
  try {
    Object.assign(data, normalizeAppointmentTiming(merged));
  } catch (error) {
    throw new APIError(error instanceof TimingError ? error.message : "Check the interview time.", 400);
  }
  if (data.status === "completed" && !merged.completedAt) data.completedAt = new Date().toISOString();
  if (system(req)) return data;
  const collectionId = merged.collection;
  if (data.stories !== undefined) {
    data.stories = unique(relationIds(data.stories));
    const members = await collectionStories(req, collectionId);
    if (relationIds(data.stories).some((id) => !members.some((story) => sameId(story, id)))) throw new APIError("Add the story to this Collection before linking it to an interview.", 400);
  }
  if (data.interviewers !== undefined) {
    data.interviewers = unique(relationIds(data.interviewers));
    if (data.interviewers.length > LIMITS.interviewers) throw new APIError(`Choose at most ${LIMITS.interviewers} interviewers.`, 400);
    if (!(await enabledUsers(req, data.interviewers))) throw new APIError("Choose newsroom accounts as interviewers.", 400);
  }
  if (data.resources !== undefined) {
    data.resources = unique(relationIds(data.resources));
    if (data.resources.length) {
      const linked = await req.payload.count({ collection: "collection-resources", where: { and: [{ id: { in: data.resources } }, { collections: { in: [relationId(collectionId)] } }] }, ...asSystem(req) });
      if (linked.totalDocs !== data.resources.length) throw new APIError("Add the resource to this Collection before attaching it to an interview.", 400);
    }
  }
  return data;
};

/**
 * One shared interview, possibly used by several of the Collection's stories.
 * It is not a Story source or appointment and needs neither: it can exist
 * before any story claims it. Its timing follows Story appointments' rules.
 */
export const CollectionInterviews: CollectionConfig = {
  slug: "collection-interviews",
  labels: { singular: "Collection interview", plural: "Collection interviews" },
  admin: { useAsTitle: "interviewee", defaultColumns: ["interviewee", "collection", "status", "scheduleMode"], group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  access: { read: signedIn, create: createInCollection, update: managedRecords, delete: managedRecords },
  hooks: { beforeChange: [normalizeInterview] },
  fields: [
    collectionField,
    { name: "interviewee", label: "Interviewee / source", type: "text", required: true, maxLength: LIMITS.collectionName },
    { name: "status", type: "select", required: true, defaultValue: "planned", index: true, options: [...INTERVIEW_STATUS_OPTIONS] },
    { name: "scheduleMode", type: "select", required: true, defaultValue: "unscheduled", index: true, options: [...SCHEDULE_MODE_OPTIONS] },
    { name: "startAt", type: "date", index: true, admin: { date: { pickerAppearance: "dayAndTime" }, condition: (data) => data?.scheduleMode === "exact" } },
    { name: "endAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" }, condition: (data) => data?.scheduleMode === "exact" } },
    { name: "windowStart", type: "text", index: true, admin: { description: "First day (YYYY-MM-DD).", condition: (data) => data?.scheduleMode === "window" } },
    { name: "windowEnd", type: "text", admin: { description: "Last day (YYYY-MM-DD), optional.", condition: (data) => data?.scheduleMode === "window" } },
    { name: "location", type: "text", maxLength: LIMITS.line },
    { name: "interviewers", type: "relationship", relationTo: "users", hasMany: true, maxRows: LIMITS.interviewers, index: true },
    { name: "stories", label: "Linked stories", type: "relationship", relationTo: "stories", hasMany: true, index: true },
    { name: "notes", type: "textarea", maxLength: LIMITS.notes },
    { name: "followUps", label: "Follow-ups", type: "textarea", maxLength: LIMITS.notes },
    { name: "privateContact", label: "Private source details", type: "textarea", maxLength: LIMITS.notes, access: { read: contactAccess, create: contactAccess, update: contactAccess } },
    { name: "resources", label: "Recordings / resources", type: "relationship", relationTo: "collection-resources", hasMany: true },
    { name: "completedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "createdBy", type: "relationship", relationTo: "users", admin: { readOnly: true }, access: { update: () => false } }
  ]
};

/* ------------------------------------------------------------- resources */

const createResource: Access = async ({ req, data }) => {
  const scope = await collectionScope(req);
  if (!scope) return false;
  if (!data) return scope.all || scope.led.length + scope.member.length > 0;
  const ids = relationIds(data.collections);
  return ids.length > 0 && ids.every((id) => collectionCanManage(scope, id));
};

const updateResource: Access = async ({ req }) => {
  const scope = await collectionScope(req);
  return scope ? managedCollections(scope, "collections") : false;
};

const normalizeResource: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation === "create") data.createdBy = data.createdBy ?? requestUser(req)?.id ?? null;
  if (typeof data.label === "string") data.label = data.label.replace(/\s+/g, " ").trim();
  if (data.label !== undefined && !data.label) throw new APIError("Give the resource a name.", 400);
  if (typeof data.url === "string") data.url = data.url.trim() || null;
  const url = data.url !== undefined ? data.url : originalDoc?.url;
  const media = relationId(data.media !== undefined ? data.media : originalDoc?.media);
  if (url) {
    const valid = validResourceUrl(url);
    if (valid !== true) throw new APIError(valid, 400);
  }
  if (!url && media === null) throw new APIError("Add a web address or choose a file from Media.", 400);
  if (system(req)) return data;
  const scope = await collectionScope(req);
  if (data.collections !== undefined) {
    data.collections = unique(relationIds(data.collections));
    const before = relationIds(originalDoc?.collections);
    const changed = [...relationIds(data.collections).filter((id) => !before.some((other) => sameId(other, id))), ...before.filter((id) => !relationIds(data.collections).some((other) => sameId(other, id)))];
    if (changed.some((id) => !collectionCanManage(scope, id))) throw new APIError("You can only add or remove resources in Collections you work on.", 403);
  }
  if (data.stories !== undefined) {
    data.stories = unique(relationIds(data.stories));
    const collections = relationIds(data.collections !== undefined ? data.collections : originalDoc?.collections);
    const found = collections.length ? await req.payload.find({ collection: "collections", where: { id: { in: collections } }, depth: 0, pagination: false, select: { stories: true }, ...asSystem(req) }) : { docs: [] };
    const members = found.docs.flatMap((doc) => relationIds(doc.stories));
    const before = relationIds(originalDoc?.stories);
    const added = relationIds(data.stories).filter((id) => !before.some((other) => sameId(other, id)));
    if (added.some((id) => !members.some((story) => sameId(story, id)))) throw new APIError("Add the story to the Collection before linking the resource to it.", 400);
  }
  return data;
};

/**
 * Shared reporting material: a web link or a Media asset (files are never
 * copied; a resource points at Media). One resource can serve several
 * Collections and stories, so removing it from a Collection unlinks it there;
 * only an explicit, editor-made delete removes it, and only once nothing
 * refers to it.
 */
export const CollectionResources: CollectionConfig = {
  slug: "collection-resources",
  labels: { singular: "Collection resource", plural: "Collection resources" },
  admin: { useAsTitle: "label", defaultColumns: ["label", "kind", "collections"], group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
  access: { read: signedIn, create: createResource, update: updateResource, delete: editorsOnly },
  hooks: {
    beforeChange: [normalizeResource],
    beforeDelete: [
      async ({ id, req }) => {
        if (system(req)) return;
        const found = await req.payload.find({ collection: "collection-resources", where: { id: { equals: id } }, depth: 0, limit: 1, select: { collections: true }, ...asSystem(req) });
        const interviews = await req.payload.count({ collection: "collection-interviews", where: { resources: { in: [id] } }, ...asSystem(req) });
        if (relationIds(found.docs[0]?.collections).length || interviews.totalDocs) throw new APIError("This resource is still used by a Collection or an interview. Remove it there first.", 409);
      }
    ]
  },
  fields: [
    { name: "label", type: "text", required: true, maxLength: LIMITS.line, index: true },
    { name: "kind", type: "select", required: true, defaultValue: "link", options: [...RESOURCE_KIND_OPTIONS] },
    { name: "url", label: "Web address", type: "text", maxLength: LIMITS.url },
    { name: "media", label: "File", type: "upload", relationTo: "media", index: true },
    { name: "collections", type: "relationship", relationTo: "collections", hasMany: true, index: true },
    { name: "stories", label: "Linked stories", type: "relationship", relationTo: "stories", hasMany: true, index: true },
    { name: "createdBy", type: "relationship", relationTo: "users", admin: { readOnly: true }, access: { update: () => false } }
  ]
};

