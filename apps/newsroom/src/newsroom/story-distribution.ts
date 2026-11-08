import type { DistributionPayload } from "@byline/newsroom-screens/editorial/editorial-rest";
import { APIError } from "payload";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { readPublicPaths } from "../public/url-changes";
import type { ScreenContext } from "./screen-models";

export async function storyDistribution(ctx: ScreenContext, storyId: number): Promise<DistributionPayload> {
  const { req } = ctx;
  const { payload } = req;
  const story = await payload.findByID({ collection: "stories", id: storyId, draft: false, depth: 0, select: { headline: true, deck: true, _status: true }, overrideAccess: false, req });
  const path = (await readPublicPaths(req, "stories", storyId)).get(storyId);
  if (!path || story._status !== "published") throw new APIError("Publish the story before distributing it.", 409);
  const publication = publicationConfigFromGlobal(await readPublishedPublication(payload, req), 0);
  return {
    storyId, headline: story.headline, canonicalUrl: publication.urls.publicSite.replace(/\/+$/, "") + path,
    excerpt: story.deck ?? "", channels: [], capabilities: { addToNewsletter: false }
  };
}
