import type { Endpoint } from "payload";
import { body, handle, idParam } from "../newsroom/http";
import { cancelScheduledFrontPage, discardDraft, featureStory, frontPageDesk, frontPageStoryPool, publishFrontPage, scheduleFrontPage, setPlacement, storyFrontPage, useLineup } from "./server";

/** The Front Page Desk's API (editors only, checked in each action) and a Story's Feature action. */
export const frontPageEndpoints: Endpoint[] = [
  { path: "/byline/front-page", method: "get", handler: handle((ctx) => frontPageDesk(ctx)) },
  { path: "/byline/front-page/stories", method: "get", handler: handle((ctx, req) => frontPageStoryPool(ctx, { search: String(req.searchParams.get("search") ?? ""), section: String(req.searchParams.get("section") ?? "") })) },
  { path: "/byline/front-page/placements", method: "put", handler: handle(async (ctx, req) => setPlacement(ctx, await body(req))) },
  { path: "/byline/front-page/discard", method: "post", handler: handle((ctx) => discardDraft(ctx)) },
  { path: "/byline/front-page/publish", method: "post", handler: handle((ctx) => publishFrontPage(ctx)) },
  { path: "/byline/front-page/schedule", method: "post", handler: handle(async (ctx, req) => scheduleFrontPage(ctx, await body(req))) },
  { path: "/byline/front-page/schedule", method: "delete", handler: handle((ctx) => cancelScheduledFrontPage(ctx)) },
  { path: "/byline/front-page/history/:id/use", method: "post", handler: handle((ctx, req) => useLineup(ctx, idParam(req))) },
  { path: "/byline/stories/:id/front-page", method: "get", handler: handle((ctx, req) => storyFrontPage(ctx, idParam(req))) },
  { path: "/byline/stories/:id/front-page", method: "post", handler: handle(async (ctx, req) => featureStory(ctx, idParam(req), await body(req))) }
];
