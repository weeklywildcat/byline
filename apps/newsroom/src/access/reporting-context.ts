import type { Access, PayloadRequest, Where } from "payload";
import { inIds, scopeManages, scopeParticipates, storyScope, type StoryScope } from "./story-context";
import { atLeast, relationId, requestUser, sameId } from "./user";

/**
 * Who sees raw reporting material (docs/reporting.md#confidentiality).
 *
 * Raw reporting is more sensitive than ordinary Story participation:
 *
 * - **normal** material is seen by everyone who can see the Story's work
 *   (its managers and participants, the same audience as the plan);
 * - **confidential** material is seen only by its creator, the Story's
 *   *assigned* editor and administrators. Being an editor, a contributor or
 *   holding a production assignment is not enough.
 *
 * Every reporting collection (notes, files, transcripts, selections) uses
 * these access functions; they become SQL `Where` constraints, so a list, a
 * count, a file route and a REST read all obey them.
 */

export type ReportingAudience = {
  scope: StoryScope;
  administrator: boolean;
  /** Stories whose plan names this account as the assigned editor. */
  assignedEditorOf: Array<number | string>;
};

const AUDIENCE_KEY = "bylineReportingAudience";

export async function reportingAudience(req: PayloadRequest): Promise<ReportingAudience | null> {
  const scope = await storyScope(req);
  if (!scope) return null;
  const cache = req.context as Record<string, unknown>;
  const cached = cache[AUDIENCE_KEY] as Promise<ReportingAudience> | undefined;
  if (cached) return cached;
  const pending = (async () => {
    const administrator = atLeast(scope.user, "administrator");
    if (administrator) return { scope, administrator, assignedEditorOf: [] };
    const plans = await req.payload.find({
      collection: "story-plans", where: { editor: { equals: scope.user.id } }, depth: 0, pagination: false, overrideAccess: true, select: { story: true }, req
    });
    const assignedEditorOf = plans.docs.map((plan) => relationId((plan as { story?: unknown }).story)).filter((id): id is number | string => id !== null);
    return { scope, administrator, assignedEditorOf };
  })();
  cache[AUDIENCE_KEY] = pending;
  return pending;
}

/** Forget the cached audience (after an assigned-editor change in the same request). */
export function resetReportingAudience(req: PayloadRequest): void {
  delete (req.context as Record<string, unknown>)[AUDIENCE_KEY];
}

function storyIdsVisible(scope: StoryScope): Array<number | string> | true {
  return scope.all ? true : [...scope.managed, ...scope.participant];
}

function storyIdsManaged(scope: StoryScope): Array<number | string> | true {
  return scope.all ? true : scope.managed;
}

const normal: Where = { confidential: { equals: false } };

function within(field: string, ids: Array<number | string> | true): Where | null {
  return ids === true ? null : inIds(field, ids);
}

/** The restricted audience's own clauses: the creator and the Story's assigned editor. */
function restricted(audience: ReportingAudience, creatorField: string): Where[] {
  return [{ [creatorField]: { equals: audience.scope.user.id } }, ...(audience.assignedEditorOf.length ? [inIds("story", audience.assignedEditorOf)] : [])];
}

/** Read: normal material on Stories the reader can see, plus confidential material they are the audience for. */
export function readReporting(creatorField = "createdBy"): Access {
  return async ({ req }) => {
    const audience = await reportingAudience(req);
    if (!audience) return false;
    if (audience.administrator) return true;
    const visible = within("story", storyIdsVisible(audience.scope));
    return { or: [visible ? { and: [normal, visible] } : normal, ...restricted(audience, creatorField)] };
  };
}

/**
 * Change or remove: the creator; the Story's assigned editor; administrators;
 * and, for normal material only, the Story's managers.
 */
export function changeReporting(creatorField = "createdBy"): Access {
  return async ({ req }) => {
    const audience = await reportingAudience(req);
    if (!audience) return false;
    if (audience.administrator) return true;
    const managed = within("story", storyIdsManaged(audience.scope));
    return { or: [managed ? { and: [normal, managed] } : normal, ...restricted(audience, creatorField)] };
  };
}

/** Create: anyone who can see the Story's work may add material to it (as themselves). */
export const createReporting: Access = async ({ req, data }) => {
  const scope = await storyScope(req);
  if (!scope) return false;
  if (!data) return scope.all || scope.managed.length > 0 || scope.participant.length > 0;
  return scopeManages(scope, data.story) || scopeParticipates(scope, data.story);
};

/** Whether this reader may see one record (for read models that already loaded it with system access). */
export function canSeeMaterial(audience: ReportingAudience, record: { story?: unknown; confidential?: unknown }, creator: unknown): boolean {
  if (audience.administrator) return true;
  if (sameId(creator, audience.scope.user.id)) return true;
  if (audience.assignedEditorOf.some((id) => sameId(id, record.story))) return true;
  if (record.confidential === true) return false;
  return scopeManages(audience.scope, record.story) || scopeParticipates(audience.scope, record.story);
}

/** Whether this reader may change one record. */
export function canChangeMaterial(audience: ReportingAudience, record: { story?: unknown; confidential?: unknown }, creator: unknown): boolean {
  if (audience.administrator) return true;
  if (sameId(creator, audience.scope.user.id)) return true;
  if (audience.assignedEditorOf.some((id) => sameId(id, record.story))) return true;
  return record.confidential !== true && scopeManages(audience.scope, record.story);
}

/** Whether the request's account may open the Story's reporting at all. */
export async function canOpenStoryReporting(req: PayloadRequest, storyId: unknown): Promise<boolean> {
  const scope = await storyScope(req);
  if (!scope) return false;
  if (scopeManages(scope, storyId) || scopeParticipates(scope, storyId)) return true;
  // The assigned editor always manages through story-context; administrators manage everything.
  return requestUser(req) !== null && atLeast(requestUser(req), "administrator");
}
