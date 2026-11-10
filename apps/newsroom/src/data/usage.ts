import { collectReferenceIds } from "@byline/editor/normalize";
import type { Payload } from "payload";

/**
 * Which published Stories place a Data Project. Kept apart from the
 * collections so the project collection can guard its own deletion with it.
 */
const system = { depth: 0, pagination: false, overrideAccess: true } as const;

export type StoryUse = { id: number; headline: string };

/** Published, undeleted Stories whose body places this project. Drafts and trashed Stories do not count. */
export async function publishedStoriesEmbedding(payload: Payload, projectId: number): Promise<StoryUse[]> {
  const { docs } = await payload.find({
    collection: "stories", draft: false, where: { and: [{ _status: { equals: "published" } }, { contentFormat: { not_equals: "legacy-html" } }] },
    select: { headline: true, body: true, deletedAt: true }, ...system
  });
  return docs
    .filter((story) => !story.deletedAt && collectReferenceIds(story.body).dataProjects.some((id) => Number(id) === projectId))
    .map((story) => ({ id: story.id, headline: story.headline }));
}

const stories = (count: number) => `${count} published ${count === 1 ? "story" : "stories"}`;

/** The refusal a reporter reads when a project that published Stories show cannot go away. */
export function projectInUseMessage(uses: readonly StoryUse[], action: "unpublishing" | "deleting"): string {
  const names = uses.slice(0, 3).map((use) => `“${use.headline}”`).join(", ");
  return `This project is used by ${stories(uses.length)} (${names}${uses.length > 3 ? ", …" : ""}). Remove it from ${uses.length === 1 ? "that story" : "those stories"} before ${action}.`;
}
