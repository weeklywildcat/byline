import type { ScreenContext } from "./screen-models";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { readLastPublicStoryPath, readPublicPaths } from "../public/url-changes";

export async function storyURLContext(ctx: ScreenContext, storyId: number) {
  const { req } = ctx;
  await req.payload.findByID({ collection: "stories", id: storyId, depth: 0, draft: true, overrideAccess: false, req, select: {} });
  const [publication, paths, sections, previousPath] = await Promise.all([
    readPublishedPublication(req.payload, req),
    readPublicPaths(req, "stories", storyId),
    req.payload.find({ collection: "sections", depth: 0, pagination: false, overrideAccess: false, req, select: { name: true, slug: true, hidden: true } }),
    readLastPublicStoryPath(req, storyId)
  ]);
  const config = publicationConfigFromGlobal(publication, 0);
  return {
    path: paths.get(storyId) ?? "",
    previousPath: paths.has(storyId) ? null : previousPath ?? null,
    publicSite: config.urls.publicSite.replace(/\/+$/, ""),
    timezone: config.timezone,
    sections: sections.docs
  };
}
export type StoryURLContext = Awaited<ReturnType<typeof storyURLContext>>;
