import type { Endpoint } from "payload";
import { body, handle, idParam } from "../newsroom/http";
import { addDistribution, distributionDesk, distributionItem, storyDistributionView, updateDistribution, type DistributionPatch } from "./server";

/** Distribution's API (docs/distribution.md). Each action checks the person in `server.ts`. */
export const distributionEndpoints: Endpoint[] = [
  {
    path: "/byline/distribution", method: "get",
    handler: handle((ctx, req) => {
      const param = (name: string) => String(req.searchParams.get(name) ?? "");
      return distributionDesk(ctx, { view: param("view"), destination: param("destination"), owner: param("owner"), section: param("section"), q: param("q"), when: param("when") });
    })
  },
  { path: "/byline/distribution/:id", method: "get", handler: handle((ctx, req) => distributionItem(ctx, idParam(req))) },
  { path: "/byline/distribution/:id", method: "patch", handler: handle(async (ctx, req) => updateDistribution(ctx, idParam(req), await body<DistributionPatch>(req))) },
  { path: "/byline/stories/:id/distribution", method: "get", handler: handle((ctx, req) => storyDistributionView(ctx, idParam(req))) },
  { path: "/byline/stories/:id/distribution", method: "post", handler: handle(async (ctx, req) => addDistribution(ctx, idParam(req), await body(req))) }
];
