import { APIError, type Access, type CollectionBeforeChangeHook, type FieldAccess, type Where } from "payload";
import { LIMITS } from "../domain/vocabulary";
import { inIds, scopeManages, scopeParticipates, storyScope } from "./story-context";
import { relationChanged, relationId, relationIds, requestUser, sameId } from "./user";

/**
 * Access for records that hang off one story and are assigned to people:
 * tasks, sources, appointments and production assignments.
 *
 * Managers of the story see and change all of them. A participant sees and
 * changes only the records assigned to them. Nobody else sees any.
 */
const mineOrManaged = async (req: Parameters<Access>[0]["req"]): Promise<boolean | Where> => {
  const scope = await storyScope(req);
  if (!scope) return false;
  if (scope.all) return true;
  return { or: [inIds("story", scope.managed), { assignees: { in: [scope.user.id] } }] };
};

export const readStoryRecords: Access = ({ req }) => mineOrManaged(req);
export const updateStoryRecords: Access = ({ req }) => mineOrManaged(req);

export const deleteStoryRecords: Access = async ({ req }) => {
  const scope = await storyScope(req);
  if (!scope) return false;
  return scope.all ? true : inIds("story", scope.managed);
};

/** Managers create records on their stories; `allowParticipants` lets a participant create one for themselves. */
export function createStoryRecords({ allowParticipants }: { allowParticipants: boolean }): Access {
  return async ({ req, data }) => {
    const scope = await storyScope(req);
    if (!scope) return false;
    // The admin asks for create permission without data to decide whether to show "Create new".
    if (!data) return scope.all || scope.managed.length > 0 || (allowParticipants && scope.participant.length > 0);
    return scopeManages(scope, data.story) || (allowParticipants && scopeParticipates(scope, data.story));
  };
}

/** Field access: only a manager of the record's story may change this field. */
export const managersOnlyField: FieldAccess = async ({ req, doc, data }) => {
  const scope = await storyScope(req);
  return scopeManages(scope, doc?.story ?? data?.story);
};

/**
 * Validate `assignees` against the actor (`byline_story_validate_assignees`):
 * at most four enabled accounts; a participant may assign only themselves and
 * keep whoever was already assigned; a participant creating a record must be
 * its only assignee. Also pins `story` once set.
 */
export const guardAssignedWork: CollectionBeforeChangeHook = (args) => assignedWorkGuard(args, async (scope, storyId) => scopeManages(scope, storyId));

/**
 * The assignee rules, with the caller deciding who manages the record: the
 * story's managers for Story work; for tasks, also the Collection's team
 * (tasks.ts in collections/StoryWork.ts).
 */
export async function assignedWorkGuard(
  { req, data, originalDoc, operation }: Parameters<CollectionBeforeChangeHook>[0],
  isManager: (scope: NonNullable<Awaited<ReturnType<typeof storyScope>>>, storyId: unknown, record: Record<string, unknown>) => Promise<boolean>
) {
  if (req.context?.bylineImport === true || req.context?.bylineSystem === true) return data;
  const user = requestUser(req);
  const scope = await storyScope(req);
  if (!user || !scope) throw new APIError("Sign in to change newsroom records.", 401);

  if (operation === "update" && originalDoc && data.story !== undefined && relationChanged(data.story, originalDoc.story)) {
    throw new APIError("A record cannot move to another story.", 400);
  }
  const storyId = data.story ?? originalDoc?.story;
  const manager = await isManager(scope, storyId, { ...originalDoc, ...data });

  const existing = relationIds(originalDoc?.assignees);
  const asked = relationIds(data.assignees);
  const requested = data.assignees === undefined ? existing : asked.filter((id, index) => asked.findIndex((other) => sameId(other, id)) === index);
  if (requested.length > LIMITS.assignees) throw new APIError(`Assign at most ${LIMITS.assignees} people.`, 400);

  if (requested.length > 0) {
    const found = await req.payload.find({
      collection: "users",
      where: { and: [{ id: { in: requested } }, { enabled: { equals: true } }] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { enabled: true },
      req
    });
    if (found.docs.length !== requested.length) throw new APIError("One of the selected people cannot be assigned work.", 400);
  }
  if (!manager) {
    for (const id of requested) {
      if (!sameId(id, user.id) && !existing.some((current) => sameId(current, id))) {
        throw new APIError("You can assign this work only to yourself.", 403);
      }
    }
    if (operation === "create" && !(requested.length === 1 && sameId(requested[0], user.id))) {
      throw new APIError("You can create this only for yourself.", 403);
    }
  }
  if (data.assignees !== undefined) data.assignees = requested;
  return data;
}

/** Enforce a per-story maximum on create. */
export function limitPerStory(collection: "sources" | "appointments" | "production-assignments" | "tasks", maximum: number, noun: string): CollectionBeforeChangeHook {
  return async ({ req, data, operation }) => {
    if (operation !== "create") return data;
    const story = relationId(data.story);
    if (story === null) return data;
    const { totalDocs } = await req.payload.count({ collection, where: { story: { equals: story } }, overrideAccess: true, req });
    if (totalDocs >= maximum) throw new APIError(`A story can have up to ${maximum} ${noun}.`, 400);
    return data;
  };
}
