import type { Endpoint } from "payload";
import { body, handle, idParam } from "../newsroom/http";
import { cancelPairing, fieldworkHandlers, preparePairing, startKiosk } from "./fieldwork";
import {
  createResultsDataset, createSession, createSurvey, linkedPolls, deleteSurvey, endSessionFromStudio, exportResponses, importSpreadsheet, pollLinkChoices, pollPeople, pollsOverview,
  pollTemplate, publishSurvey, saveLocation, surveyDetail, surveyResults, surveyWorkbook, updateSurvey, versionDetail
} from "./server";

import { pollMediaEndpoint } from "./media";

const sessionParam = (value: unknown) => String(value ?? "");

/**
 * Wildcat Polls' API. Poll Studio routes use the signed-in account (`handle`
 * re-checks it); kiosk routes accept only the kiosk credential; the pairing
 * route is anonymous and trades only a live single-use code for one; public-link
 * routes are anonymous and act only on an open, enabled public poll.
 */
export const pollEndpoints: Endpoint[] = [
  pollMediaEndpoint,
  { path: "/byline/polls", method: "get", handler: handle((ctx) => pollsOverview(ctx)) },
  { path: "/byline/polls/import", method: "post", handler: handle((ctx, req) => importSpreadsheet(ctx, req)) },
  { path: "/byline/polls/files/:file", method: "get", handler: handle(async (ctx, req) => pollTemplate(ctx, String(req.routeParams?.file ?? ""))) },
  { path: "/byline/polls/people", method: "get", handler: handle((ctx) => pollPeople(ctx)) },
  { path: "/byline/polls/links", method: "get", handler: handle((ctx, req) => pollLinkChoices(ctx, String(req.searchParams.get("search") ?? ""))) },
  { path: "/byline/polls/linked", method: "get", handler: handle((ctx, req) => linkedPolls(ctx, req.searchParams)) },
  { path: "/byline/polls/surveys", method: "post", handler: handle(async (ctx, req) => createSurvey(ctx, await body(req))) },
  { path: "/byline/polls/surveys/:id", method: "get", handler: handle((ctx, req) => surveyDetail(ctx, idParam(req))) },
  { path: "/byline/polls/surveys/:id", method: "patch", handler: handle(async (ctx, req) => updateSurvey(ctx, idParam(req), await body(req))) },
  { path: "/byline/polls/surveys/:id/delete", method: "post", handler: handle(async (ctx, req) => deleteSurvey(ctx, idParam(req), await body(req))) },
  { path: "/byline/polls/surveys/:id/publish", method: "post", handler: handle(async (ctx, req) => publishSurvey(ctx, idParam(req), await body(req))) },
  { path: "/byline/polls/surveys/:id/versions/:versionId", method: "get", handler: handle((ctx, req) => versionDetail(ctx, idParam(req), idParam(req, "versionId"))) },
  { path: "/byline/polls/surveys/:id/workbook", method: "get", handler: handle((ctx, req) => surveyWorkbook(ctx, idParam(req), Number(req.searchParams.get("version")) || null)) },
  { path: "/byline/polls/surveys/:id/results", method: "get", handler: handle((ctx, req) => surveyResults(ctx, idParam(req), req.searchParams)) },
  { path: "/byline/polls/surveys/:id/dataset", method: "post", handler: handle((ctx, req) => createResultsDataset(ctx, idParam(req), req.searchParams)) },
  { path: "/byline/polls/surveys/:id/export/responses", method: "get", handler: handle((ctx, req) => exportResponses(ctx, idParam(req), req.searchParams, "responses")) },
  { path: "/byline/polls/surveys/:id/export/summary", method: "get", handler: handle((ctx, req) => exportResponses(ctx, idParam(req), req.searchParams, "summary")) },
  { path: "/byline/polls/locations", method: "post", handler: handle(async (ctx, req) => saveLocation(ctx, null, await body(req))) },
  { path: "/byline/polls/locations/:id", method: "patch", handler: handle(async (ctx, req) => saveLocation(ctx, idParam(req), await body(req))) },
  { path: "/byline/polls/sessions", method: "post", handler: handle(async (ctx, req) => createSession(ctx, await body(req))) },
  { path: "/byline/polls/sessions/:session/kiosk", method: "post", handler: handle(async (ctx, req) => startKiosk(ctx, req, sessionParam(req.routeParams?.session), await body(req))) },
  { path: "/byline/polls/sessions/:session/pairing", method: "post", handler: handle(async (ctx, req) => preparePairing(ctx, req, sessionParam(req.routeParams?.session), await body(req))) },
  { path: "/byline/polls/sessions/:session/pairing/cancel", method: "post", handler: handle((ctx, req) => cancelPairing(ctx, req, sessionParam(req.routeParams?.session))) },
  { path: "/byline/polls/sessions/:session/end", method: "post", handler: handle((ctx, req) => endSessionFromStudio(ctx, sessionParam(req.routeParams?.session))) },
  // Pairing (`/poll`): anonymous, a single-use code in exchange for a kiosk credential.
  { path: "/byline/polls/pair", method: "post", handler: fieldworkHandlers.pair },
  // The kiosk: its credential only.
  { path: "/byline/polls/kiosk", method: "get", handler: fieldworkHandlers.state },
  { path: "/byline/polls/kiosk/unlock", method: "post", handler: fieldworkHandlers.unlock },
  { path: "/byline/polls/kiosk/lock", method: "post", handler: fieldworkHandlers.lock },
  { path: "/byline/polls/kiosk/decline", method: "post", handler: fieldworkHandlers.decline },
  { path: "/byline/polls/kiosk/begin", method: "post", handler: fieldworkHandlers.begin },
  { path: "/byline/polls/kiosk/responses", method: "post", handler: fieldworkHandlers.submit },
  { path: "/byline/polls/kiosk/pause", method: "post", handler: fieldworkHandlers.pause },
  { path: "/byline/polls/kiosk/resume", method: "post", handler: fieldworkHandlers.resume },
  { path: "/byline/polls/kiosk/location", method: "post", handler: fieldworkHandlers.move },
  { path: "/byline/polls/kiosk/end", method: "post", handler: fieldworkHandlers.end },
  // Public links: anonymous, open polls only.
  { path: "/byline/polls/public/:key", method: "get", handler: fieldworkHandlers.publicPoll },
  { path: "/byline/polls/public/:key/start", method: "post", handler: fieldworkHandlers.publicStart },
  { path: "/byline/polls/public/:key/responses", method: "post", handler: fieldworkHandlers.publicSubmit }
];
