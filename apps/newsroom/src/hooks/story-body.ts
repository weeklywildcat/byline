import { articleMediaFromPayload, collectMediaIds, collectReferenceIds, normalizePayloadArticleBody, type NormalizeIssue } from "@byline/editor/normalize";
import { enforcePrivilegedBlocks } from "@byline/editor/permissions";
import { ensureEditableLexicalRoot } from "@byline/editor/serialize";
import { blockLabel, isBlockingIssue, mediaKey, type MediaId, type PublicEventReference, type PublicPollReference, type PublicStoryReference } from "@byline/article-body";
import { repositoryInteractiveRegistry } from "@byline/story-presentations/interactives";
import { repositoryTrackerRegistry } from "@byline/story-presentations/trackers";
import { ValidationError, type CollectionBeforeChangeHook, type FieldHook, type Payload, type PayloadRequest } from "payload";
import { atLeast, requestUser } from "../access/user";
import { embeddableDataProjects } from "../data/embed";
import { loadPreviewPublication } from "../preview/publication";
import { publicEventReference, publicPollReference, publicStoryReference } from "../public/references";

/** Repair previously stored empty roots on read, including drafts and historical versions. */
export const repairEmptyStoryBody: FieldHook = ({ value, siblingData }) =>
  siblingData?.contentFormat === "legacy-html" ? value : ensureEditableLexicalRoot(value);

/**
 * Server-side rules for a Story's article body, whatever the browser did.
 *
 * 1. Privileged blocks (Editor's Note, Repository Interactive) belong to
 *    editors and administrators. A staff writer who can edit the Story can
 *    still submit any Lexical body, so the server compares it with the
 *    previous permitted body and *restores* privileged blocks that were added,
 *    changed or removed (`enforcePrivilegedBlocks`). The rest of their
 *    submission is kept; an unchanged privileged block always survives.
 * 2. Publishing is strict. Drafting and autosave accept anything; publishing
 *    refuses a body with a block that would be left out whole, or a part that
 *    would lose substantive content, with one message per block. The same
 *    `finalizeBlock` rules draw the writer-facing notes in the editor.
 */

/** Interactives the server knows. The fixture is available only where the host opts into fixtures. */
export const repositoryInteractivesForServer = () => repositoryInteractiveRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production" });
/** Trackers the server knows, under the same fixture rule. */
export const repositoryTrackersForServer = () => repositoryTrackerRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production" });

export const guardPrivilegedBlocks: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (req.context?.bylineImport === true || req.context?.bylineSystem === true) return data;
  if (data.body === undefined) return data;
  // Scripts, jobs and the importer run without an account; access control already decided who may reach an HTTP save.
  if (!req.user) return data;
  if (atLeast(requestUser(req), "editor")) return data;
  const { body, restored, rejected } = enforcePrivilegedBlocks(data.body, originalDoc?.body);
  if (restored.length || rejected.length) {
    data.body = body;
    req.payload.logger.warn({ msg: "Restored privileged story blocks a staff writer changed", storyId: originalDoc?.id ?? null, restored, rejected });
  }
  return data;
};

type Doc = Record<string, unknown>;

/** The public-safe records a body names, resolved from Payload for the normalizer. */
export async function resolveBodyRecords(payload: Payload, body: unknown, options: { storyId?: number | string | null; req?: PayloadRequest }) {
  const mediaIds = collectMediaIds(body).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
  const { stories: storyIds, polls: pollIds, events: eventIds, dataProjects: dataProjectIds } = collectReferenceIds(body);
  const { timeZone } = await loadPreviewPublication(payload);
  const read = { depth: 1, pagination: false as const, overrideAccess: true as const, req: options.req };

  const [mediaFound, storiesFound, pollsFound, eventsFound, embeddable] = await Promise.all([
    mediaIds.length ? payload.find({ collection: "media", where: { id: { in: mediaIds } }, ...read, depth: 0 }) : { docs: [] },
    storyIds.length ? payload.find({ collection: "stories", where: { and: [{ id: { in: storyIds.map(Number) } }, { _status: { equals: "published" } }] }, draft: false, ...read }) : { docs: [] },
    pollIds.length ? payload.find({ collection: "polls", where: { id: { in: pollIds.map(Number) } }, ...read, depth: 0 }) : { docs: [] },
    eventIds.length ? payload.find({ collection: "events", where: { and: [{ id: { in: eventIds.map(Number) } }, { _status: { equals: "published" } }] }, draft: false, ...read, depth: 0 }) : { docs: [] },
    // A Data Project is embeddable only when it has a valid published public representation (never a draft's).
    embeddableDataProjects(payload, dataProjectIds.map(Number), options.req)
  ]);

  const media = new Map<string, Doc>(mediaFound.docs.map((doc) => [mediaKey(doc.id as MediaId), doc as unknown as Doc]));
  const stories = new Map<string, { reference: PublicStoryReference; thumbnail: Doc | null }>();
  for (const doc of storiesFound.docs) {
    const projected = publicStoryReference(doc, { timeZone, excludeId: options.storyId ?? null });
    if (projected) {
      stories.set(mediaKey(doc.id as MediaId), projected);
      if (projected.thumbnail) media.set(mediaKey(projected.thumbnail.id as MediaId), projected.thumbnail);
    }
  }
  const polls = new Map<string, PublicPollReference>();
  for (const doc of pollsFound.docs) {
    const projected = publicPollReference(doc);
    if (projected) polls.set(mediaKey(doc.id as MediaId), projected);
  }
  const events = new Map<string, PublicEventReference>();
  for (const doc of eventsFound.docs) {
    const projected = publicEventReference(doc);
    if (projected) events.set(mediaKey(doc.id as MediaId), projected);
  }
  const registry = repositoryInteractivesForServer();
  const trackers = repositoryTrackersForServer();
  return {
    media: (id: MediaId) => {
      const doc = media.get(mediaKey(id));
      return doc ? articleMediaFromPayload(doc, (item) => `/api/media/file/${String(item.filename ?? item.id)}`) : null;
    },
    references: {
      story: (id: MediaId) => stories.get(mediaKey(id))?.reference ?? null,
      poll: (id: MediaId) => polls.get(mediaKey(id)) ?? null,
      event: (id: MediaId) => events.get(mediaKey(id)) ?? null,
      dataProject: (id: MediaId) => (embeddable.has(Number(id)) ? { id } : null),
      interactive: (key: string) => key in registry,
      tracker: (key: string) => Object.hasOwn(trackers, key)
    }
  };
}


/** One line per problem a publication cannot ship with. */
export function blockingBodyProblems(issues: NormalizeIssue[]): string[] {
  return issues.flatMap((issue) => {
    if (issue.kind === "unsupported-node") return [`Remove or replace unsupported content (${issue.nodeType}).`];
    if (issue.kind === "unsupported-format") return [`Remove unsupported formatting (${issue.format}).`];
    if (issue.kind === "unsafe-link") return ["Replace the unsafe link in the story body."];
    if (issue.kind === "source" && issue.code === "source-incomplete") return [`Source: ${issue.message}`];
    if (issue.kind !== "block" || !isBlockingIssue(issue.issue)) return [];
    return [`${blockLabel(issue.issue.type)}: ${issue.issue.message}`];
  });
}

export async function storyBodyProblems(req: PayloadRequest, body: unknown, storyId: string | number | null): Promise<string[]> {
  const { media, references } = await resolveBodyRecords(req.payload, body, { storyId, req });
  return blockingBodyProblems(normalizePayloadArticleBody(body, { media, references }).issues);
}

export const requireCompleteBody: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (data._status !== "published" || req.context?.bylineImport === true) return data;
  const contentFormat = data.contentFormat ?? originalDoc?.contentFormat;
  if (contentFormat === "legacy-html") return data;
  const body = data.body !== undefined ? data.body : originalDoc?.body;
  const problems = await storyBodyProblems(req, body, originalDoc?.id ?? null);
  if (!problems.length) return data;
  throw new ValidationError({ collection: "stories", req, errors: problems.map((message) => ({ path: "body", message })) });
};
