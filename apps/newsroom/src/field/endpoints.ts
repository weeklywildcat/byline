import type { Endpoint } from "payload";
import { body, handle, idParam } from "../newsroom/http";
import { fieldFeed, fieldLivePost, fieldSession, fieldStorySearch } from "./server";

/** Field Mode's API. Notes, files and photos use Reporting's capture endpoints. */
export const fieldEndpoints: Endpoint[] = [
  { path: "/byline/field", method: "get", handler: handle((ctx) => fieldFeed(ctx)) },
  { path: "/byline/field/search", method: "get", handler: handle((ctx, req) => fieldStorySearch(ctx, String(req.searchParams.get("query") ?? ""))) },
  { path: "/byline/field/stories/:id", method: "get", handler: handle((ctx, req) => fieldSession(ctx, idParam(req), Number(req.searchParams.get("appointment")) || null)) },
  { path: "/byline/field/stories/:id/live", method: "post", handler: handle(async (ctx, req) => fieldLivePost(ctx, idParam(req), await body(req))) }
];
