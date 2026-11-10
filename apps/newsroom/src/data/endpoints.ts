import type { Endpoint } from "payload";
import { body, handle, idParam } from "../newsroom/http";
import { BUILD_DATA_RELEASE_PATH, serveDataRelease } from "./snapshot";
import {
  createDataset, createProject, createRows, dataOverview, datasetDetail, deleteDataset, deleteProject, deleteRows, exportRows, importRows,
  projectDetail, publishDataset, publishProject, queryRows, storyChoices, unpublishProject, updateDataset, updateProject, updateRows
} from "./server";

/** The Data workspace's API (each handler re-checks the account) and the build-only release endpoint. */
export const dataEndpoints: Endpoint[] = [
  { path: "/byline/data", method: "get", handler: handle((ctx) => dataOverview(ctx)) },
  { path: "/byline/data/datasets", method: "post", handler: handle(async (ctx, req) => createDataset(ctx, await body(req))) },
  { path: "/byline/data/datasets/:id", method: "get", handler: handle((ctx, req) => datasetDetail(ctx, idParam(req))) },
  { path: "/byline/data/datasets/:id", method: "patch", handler: handle(async (ctx, req) => updateDataset(ctx, idParam(req), await body(req))) },
  { path: "/byline/data/datasets/:id", method: "delete", handler: handle((ctx, req) => deleteDataset(ctx, idParam(req))) },
  { path: "/byline/data/datasets/:id/rows", method: "get", handler: handle((ctx, req) => queryRows(ctx, idParam(req), req.searchParams.get("query"))) },
  { path: "/byline/data/datasets/:id/rows", method: "post", handler: handle(async (ctx, req) => createRows(ctx, idParam(req), await body(req))) },
  { path: "/byline/data/datasets/:id/rows", method: "patch", handler: handle(async (ctx, req) => updateRows(ctx, idParam(req), await body(req))) },
  { path: "/byline/data/datasets/:id/rows/delete", method: "post", handler: handle(async (ctx, req) => deleteRows(ctx, idParam(req), await body(req))) },
  { path: "/byline/data/datasets/:id/import", method: "post", handler: handle(async (ctx, req) => importRows(ctx, idParam(req), await body(req))) },
  { path: "/byline/data/datasets/:id/export", method: "get", handler: handle((ctx, req) => exportRows(ctx, idParam(req), req.searchParams.get("fields"))) },
  { path: "/byline/data/datasets/:id/publish", method: "post", handler: handle(async (ctx, req) => publishDataset(ctx, idParam(req), await body(req))) },
  { path: "/byline/data/projects", method: "post", handler: handle(async (ctx, req) => createProject(ctx, await body(req))) },
  { path: "/byline/data/projects/:id", method: "get", handler: handle((ctx, req) => projectDetail(ctx, idParam(req))) },
  { path: "/byline/data/projects/:id", method: "patch", handler: handle(async (ctx, req) => updateProject(ctx, idParam(req), await body(req))) },
  { path: "/byline/data/projects/:id", method: "delete", handler: handle((ctx, req) => deleteProject(ctx, idParam(req))) },
  { path: "/byline/data/projects/:id/publish", method: "post", handler: handle((ctx, req) => publishProject(ctx, idParam(req))) },
  { path: "/byline/data/projects/:id/unpublish", method: "post", handler: handle((ctx, req) => unpublishProject(ctx, idParam(req))) },
  { path: "/byline/data/stories", method: "get", handler: handle((ctx, req) => storyChoices(ctx, String(req.searchParams.get("search") ?? ""))) },
  { path: BUILD_DATA_RELEASE_PATH, method: "get", handler: (req) => serveDataRelease(req) }
];
