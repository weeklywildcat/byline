import type { PayloadRequest } from "payload";
import { relationId } from "../access/user";
import type { StoryState } from "../distribution/model";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { readPublicPaths } from "../public/url-changes";

export type PublicStoryFacts = StoryState & { id: number; section: number | null };

const withoutTrailingSlashes = (value: string) => {
  let end = value.length;
  while (value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
};

/**
 * What Distribution inherits from Stories: the public (published) headline,
 * deck and featured image, and the canonical public URL, resolved on the
 * server from the publication's public site and the Story's public path,
 * never from anything a browser sends. An unpublished Story has no URL;
 * `everPublished` says whether it went out before (its first publication is
 * kept on unpublish). Reads as the system: callers check access first.
 */
export async function publicStoryFacts(req: PayloadRequest, ids: readonly number[]): Promise<Map<number, PublicStoryFacts>> {
  const result = new Map<number, PublicStoryFacts>();
  const unique = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!unique.length) return result;
  const { payload } = req;
  const [{ docs }, paths, publication] = await Promise.all([
    payload.find({
      collection: "stories", where: { id: { in: unique } }, draft: false, depth: 0, pagination: false, overrideAccess: true, req,
      select: { headline: true, deck: true, featuredMedia: true, section: true, _status: true, publishedAt: true }
    }),
    readPublicPaths(req, "stories", unique.length === 1 ? unique[0] : undefined),
    readPublishedPublication(payload, req)
  ]);
  const site = withoutTrailingSlashes(publicationConfigFromGlobal(publication, 0).urls.publicSite);
  for (const story of docs) {
    const path = paths.get(story.id);
    const published = story._status === "published" && Boolean(path);
    const featured = Number(relationId(story.featuredMedia));
    const section = Number(relationId(story.section));
    result.set(story.id, {
      id: story.id, headline: story.headline ?? "", deck: story.deck ?? "", url: published ? site + path : null,
      featuredMedia: Number.isSafeInteger(featured) && featured > 0 ? featured : null,
      section: Number.isSafeInteger(section) && section > 0 ? section : null,
      published, everPublished: published || Boolean(story.publishedAt)
    });
  }
  return result;
}
