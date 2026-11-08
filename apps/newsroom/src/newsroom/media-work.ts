import type { MediaAssignmentRow, MediaAttachment, MediaDeskResponse, MediaReadiness, PlanningVisualStatus, PlanningVisualType } from "@byline/newsroom-screens/planning/planning-model";
import { mediaMetadataGaps } from "@byline/newsroom-screens/media/media-library-model";
import { atLeast, relationIds } from "../access/user";
import type { Media, ProductionAssignment } from "../payload-types";
import { libraryAsset } from "./media-library";
import { loadPeople, readableStories, userAvatar, userPerson, type ScreenContext } from "./screen-models";

/**
 * Media Work (`GET /api/byline/media/work`): the Payload side of the shared
 * production desk's `MediaDeskResponse`, from `production-assignments` read
 * as the signed-in account. There is no production table of its own and no
 * read as the system: an editor sees the newsroom's assignments, a staff
 * member only the work Story Work access already gives them (the stories
 * they manage, and assignments they hold). Story titles come from the stories
 * this account may read, the way every other newsroom screen reads them.
 */
const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const });

function attachment(ctx: ScreenContext, media: Media): MediaAttachment {
  const asset = libraryAsset(ctx, media, { users: new Map(), folders: new Map() });
  const gaps = mediaMetadataGaps(asset);
  return {
    id: media.id,
    title: asset.filename,
    url: asset.url,
    previewUrl: asset.previewUrl,
    mimeType: asset.mimeType,
    isImage: asset.kind === "image",
    alt: asset.alt,
    creator: asset.creator,
    creditText: asset.credit,
    copyrightNotice: asset.copyright,
    licenseUrl: asset.license,
    acquireLicensePage: asset.sourceUrl,
    checks: { alt: !gaps.includes("alt"), credit: !gaps.includes("credit"), rights: !gaps.includes("rights") }
  };
}

export async function mediaWork(ctx: ScreenContext): Promise<MediaDeskResponse> {
  const [people, rows] = await Promise.all([
    loadPeople(ctx),
    // A complete read: Payload applies `limit` even with pagination off, so none is passed.
    ctx.req.payload.find({ collection: "production-assignments", depth: 0, pagination: false, sort: "deadline", ...asUser(ctx) })
  ]);
  const assignments = rows.docs as ProductionAssignment[];
  const mediaIds = [...new Set(assignments.flatMap((row) => relationIds(row.media).map(Number)))];
  const storyIds = [...new Set(assignments.map((row) => Number(relationIds([row.story])[0])))].filter(Number.isFinite);
  const [files, stories] = await Promise.all([
    mediaIds.length ? ctx.req.payload.find({ collection: "media", where: { id: { in: mediaIds } }, depth: 0, pagination: false, ...asUser(ctx) }) : Promise.resolve({ docs: [] as Media[] }),
    readableStories(ctx, storyIds, { headline: true })
  ]);
  const fileById = new Map(files.docs.map((media) => [media.id, attachment(ctx, media)]));
  const titleById = new Map(stories.map((story) => [story.id, story.headline?.trim() || "Untitled story"]));

  const result: MediaAssignmentRow[] = assignments.map((row, order) => {
    const storyId = Number(relationIds([row.story])[0]);
    const attachmentIds = relationIds(row.media).map(Number);
    const attachments = attachmentIds.map((id) => fileById.get(id)).filter((file): file is MediaAttachment => Boolean(file));
    const invalid = attachmentIds.filter((id) => !fileById.has(id));
    const readiness: MediaReadiness = {
      attachmentIds,
      invalidAttachmentIds: invalid,
      missingAltIds: attachments.filter((file) => file.checks?.alt === false).map((file) => file.id),
      missingCreditIds: attachments.filter((file) => file.checks?.credit === false).map((file) => file.id),
      missingRightsIds: attachments.filter((file) => file.checks?.rights === false).map((file) => file.id)
    };
    const assigneeId = relationIds(row.assignees)[0];
    return {
      id: String(row.id),
      story: { id: storyId, title: titleById.get(storyId) ?? "Story", editUrl: `${ctx.admin}/collections/stories/${storyId}` },
      title: row.title,
      type: row.type as PlanningVisualType,
      status: row.status as PlanningVisualStatus,
      assignee: assigneeId === undefined ? null : userPerson(people, assigneeId),
      dueAt: row.deadline ?? null,
      notes: row.notes ?? "",
      attachmentIds,
      attachments,
      invalidAttachmentIds: invalid,
      mediaReadiness: readiness,
      featuredAttachmentId: null,
      order,
      isLegacy: row.legacyAssignmentId === "legacy-v1"
    };
  });

  const editor = atLeast(ctx.user, "editor");
  return {
    requests: [],
    assignments: result,
    timezone: ctx.timeZone,
    assignees: [...people.users.values()].map((user) => ({ id: user.id, name: user.name, kind: "user" as const, avatarUrl: userAvatar(people, user.id) })),
    capabilities: { canAssign: editor, canManageMedia: true }
  };
}
