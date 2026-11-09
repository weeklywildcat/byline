import { relatedStories } from "@byline/content/story";
import { articleMediaFromPayload } from "@byline/editor/normalize";
import { APIError } from "payload";
import { relationId } from "../access/user";
import { payloadStorySummary } from "../preview/payload-story";
import { relatedCandidateDocs } from "../preview/context";
import { loadPreviewPublication } from "../preview/publication";
import { publicStoryReference } from "../public/references";
import type { ScreenContext } from "./screen-models";

/**
 * Related Coverage's "Suggested" list: published stories ranked for this
 * story by Byline's one related-story rule (`relatedStories`: shared section
 * and topics, then newest), from the same candidate read Live Preview uses.
 * Suggestions only. The writer still chooses each story, which writes the
 * block's ordinary Story relationship; nothing here reaches a public article.
 * The story itself and its unpublished state are read with the user's access.
 */
const SUGGESTION_LIMIT = 8;

type Doc = Record<string, unknown>;

export async function relatedSuggestions(ctx: ScreenContext, storyId: number) {
  let story: Doc;
  try {
    story = await ctx.req.payload.findByID({ collection: "stories", id: storyId, depth: 1, draft: true, req: ctx.req, overrideAccess: false, select: { section: true, topics: true, headline: true, slug: true, publishedAt: true } }) as unknown as Doc;
  } catch {
    throw new APIError("You don't have access to this story.", 403);
  }
  const section = Number(relationId(story.section as never)) || null;
  const topics = (Array.isArray(story.topics) ? story.topics : []).map((topic) => Number(relationId(topic as never))).filter((id) => id > 0);
  const docs = (await relatedCandidateDocs(ctx, storyId, { section, topics })) as unknown as Doc[];
  const publication = await loadPreviewPublication(ctx.req.payload);
  const self = { ...payloadStorySummary({ ...story, id: storyId }, publication), listed: true };
  const ranked = relatedStories(self, docs.map((doc) => payloadStorySummary(doc, publication))).slice(0, SUGGESTION_LIMIT);
  const byId = new Map(docs.map((doc) => [Number(doc.id), doc]));
  return {
    stories: ranked.flatMap((summary) => {
      const projected = publicStoryReference(byId.get(Number(summary.id)), { timeZone: publication.timeZone, excludeId: storyId });
      if (!projected) return [];
      const thumbnail = projected.thumbnail ? articleMediaFromPayload(projected.thumbnail, (media) => (media.sizes as { library?: { url?: string } } | undefined)?.library?.url ?? (typeof media.url === "string" ? media.url : null)) : null;
      return [{ ...projected.reference, ...(thumbnail ? { thumbnailAsset: thumbnail } : {}) }];
    })
  };
}
