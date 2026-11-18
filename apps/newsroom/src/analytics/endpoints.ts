import { APIError, type Endpoint, type PayloadRequest } from "payload";
import { parseCookies } from "payload/shared";
import { atLeast, newsroomUser, requestUser } from "../access/user";
import { newsroomTimeZone } from "../domain/dates";
import { body, handle, json } from "../newsroom/http";
import { readableStories, type ScreenContext } from "../newsroom/screen-models";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { getProperty, getStream, listAccountSummaries, listWebStreams, recommendStream, timeZoneWarning } from "./admin-client";
import { analyticsCache } from "./cache";
import { loadCatalog } from "./catalog";
import { ANALYTICS_CALLBACK, ANALYTICS_START, analyticsOAuthConfig, analyticsSetupProblems, integrationsSecret } from "./config";
import { accessToken, disconnect, markNeedsReconnect, patchIntegration, readIntegration, reportingTarget, storeGrant, touchSuccess, type ConsentMode, type IntegrationState, type TrackingMode } from "./connection";
import { runReport } from "./data-client";
import { resolveRange } from "./dates";
import { AnalyticsError, problemFor, toProblem } from "./errors";
import { type AnalyticsProblem, type ContentFilters, type HomeAudienceDto, type StoryPerformanceDto } from "./model";
import { acceptAnalyticsCallback, beginAnalyticsGrant, exchangeAnalyticsCode, GrantError } from "./oauth";
import { analyticsMetrics } from "./model";
import { choiceOf, desiredPublicAnalytics, publishAnalyticsChoice, publishedChoice, sameChoice } from "./public-analytics";
import { realtime, homeAudience, readersOnStory } from "./realtime";
import { acquisition, audience, content, events, overview, storyPerformance, toStoryRef, type ReportContext } from "./reports";
import { publicTagPresent } from "./tag-check";
import { googleCookie, googleCookieName } from "../auth/google-round-trip";

/* ------------------------------------------------------------------- access */

function administrator(ctx: ScreenContext) {
  if (!atLeast(ctx.user, "administrator")) throw new APIError("Only administrators manage the Analytics connection.", 403);
}
function editor(ctx: ScreenContext) {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can use Analytics.", 403);
}

const NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
type Envelope<T> = { data: T | null; problem: AnalyticsProblem | null };
const ok = <T,>(data: T): Envelope<T> => ({ data, problem: null });

/* --------------------------------------------------------------- connection */

export type ConnectionDto = {
  status: IntegrationState["status"];
  setupProblems: string[];
  redirectUri: string | null;
  googleAccountEmail: string | null;
  property: { resource: string; id: string; name: string; timeZone: string | null } | null;
  stream: { resource: string; name: string; defaultUri: string | null } | null;
  measurementId: string | null;
  trackingMode: TrackingMode;
  consentMode: ConsentMode;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastErrorCode: string | null;
  timeZoneWarning: string | null;
  publication: { publicSite: string; timeZone: string };
  /** What the public site currently carries, so the page can say "saved, not published yet". */
  published: { installTag: boolean; measurementId: string; consentMode: "always" | "ask" } | null;
  publishedMatches: boolean;
};

async function connectionDto(req: PayloadRequest): Promise<ConnectionDto> {
  const { payload } = req;
  const state = await readIntegration(payload);
  const publication = publicationConfigFromGlobal(await readPublishedPublication(payload, req), 0);
  const published = await publishedChoice(payload, req);
  const desired = desiredPublicAnalytics(state);
  const oauth = analyticsOAuthConfig(payload.config.routes.api);
  return {
    status: state.status,
    setupProblems: analyticsSetupProblems(payload.config.routes.api),
    redirectUri: oauth?.callback ?? null,
    googleAccountEmail: state.googleAccountEmail,
    property: state.propertyResource ? { resource: state.propertyResource, id: state.propertyResource.replace("properties/", ""), name: state.propertyDisplayName ?? state.propertyResource, timeZone: state.propertyTimeZone } : null,
    stream: state.streamResource ? { resource: state.streamResource, name: state.streamDisplayName ?? state.streamResource, defaultUri: state.streamDefaultUri } : null,
    measurementId: state.measurementId, trackingMode: state.trackingMode, consentMode: state.consentMode,
    connectedAt: state.connectedAt, lastVerifiedAt: state.lastVerifiedAt, lastSuccessfulRequestAt: state.lastSuccessfulRequestAt, lastErrorCode: state.lastErrorCode,
    timeZoneWarning: timeZoneWarning(state.propertyTimeZone, publication.timezone),
    publication: { publicSite: publication.urls.publicSite, timeZone: publication.timezone },
    published, publishedMatches: sameChoice(published ?? { installTag: false, measurementId: "", consentMode: "ask" }, desired)
  };
}

const redirect = (location: string, ...cookies: string[]) => {
  const headers = new Headers({ Location: location, ...NO_STORE });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
};

/**
 * Ends the cross-site callback with a same-origin hop: the browser arrived from Google, so a plain redirect
 * would reach the admin as a cross-site request, which Payload won't authenticate. A refresh issued by this
 * page is same-origin.
 */
const finish = (location: string, ...cookies: string[]) => {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", Refresh: `0; url=${location}`, ...NO_STORE });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  const escaped = location.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${escaped}"><title>Finishing…</title></head><body><p>Finishing the Google Analytics connection… <a href="${escaped}">Continue</a></p></body></html>`, { status: 200, headers });
};

const sitePage = (req: PayloadRequest, query: string) => `${req.payload.config.routes.admin}/site?tab=analytics${query}`;

/* ------------------------------------------------------------------ helpers */

async function reportContext(ctx: ScreenContext, req: PayloadRequest): Promise<ReportContext> {
  const target = await reportingTarget(req.payload);
  const catalog = await loadCatalog(req.payload);
  return { token: target.token, property: target.property, timeZone: target.timeZone, catalog, now: ctx.now, refresh: req.searchParams.get("refresh") === "1" };
}

/** Runs a report; Google or connection trouble becomes a state the screen can explain, not a failure. */
async function reporting<T>(ctx: ScreenContext, req: PayloadRequest, run: (context: ReportContext) => Promise<T>): Promise<Envelope<T>> {
  try {
    const context = await reportContext(ctx, req);
    const data = await run(context);
    void touchSuccess(req.payload);
    return ok(data);
  } catch (error) {
    if (!(error instanceof AnalyticsError)) throw error;
    return { data: null, problem: error.problem };
  }
}

const dates = (req: PayloadRequest) => ({ preset: req.searchParams.get("preset") ?? undefined, start: req.searchParams.get("start") ?? undefined, end: req.searchParams.get("end") ?? undefined });
const intParam = (req: PayloadRequest, name: string) => {
  const value = Number(req.searchParams.get(name));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

/* ---------------------------------------------------------------- endpoints */

export const analyticsEndpoints: Endpoint[] = [
  { path: "/byline/analytics/connection", method: "get", handler: handle(async (ctx, req) => { administrator(ctx); return connectionDto(req); }) },

  {
    path: ANALYTICS_START, method: "get",
    handler: (req) => {
      const user = requestUser(req);
      if (!user || !atLeast(user, "administrator")) return redirect(sitePage(req, "&analytics=forbidden"));
      const config = analyticsOAuthConfig(req.payload.config.routes.api);
      if (!config || !integrationsSecret()) return redirect(sitePage(req, "&analytics=not-configured"));
      try {
        const grant = beginAnalyticsGrant(config, req.payload.secret, { userId: user.id, returnTo: sitePage(req, "") });
        return redirect(grant.url, googleCookie(config.secure, grant.cookie, "analytics"));
      } catch {
        return redirect(sitePage(req, "&analytics=failed"), googleCookie(config.secure, undefined, "analytics"));
      }
    }
  },

  {
    path: ANALYTICS_CALLBACK, method: "get",
    handler: async (req) => {
      const config = analyticsOAuthConfig(req.payload.config.routes.api);
      if (!config) return finish(sitePage(req, "&analytics=not-configured"));
      const clear = googleCookie(config.secure, undefined, "analytics");
      const query = req.searchParams;
      // Never a session here (a cross-site arrival has none): the signed transaction says who started it.
      const trip = acceptAnalyticsCallback({
        cookie: parseCookies(req.headers).get(googleCookieName(config.secure, "analytics")), state: query.get("state"), payloadSecret: req.payload.secret,
        sessionUserId: requestUser(req)?.id
      });
      if (!trip) return finish(sitePage(req, query.get("error") === "access_denied" ? "&analytics=denied" : "&analytics=failed"), clear);
      // The starter must still be an enabled administrator.
      const starter = await req.payload.findByID({ collection: "users", id: trip.binding, depth: 0, overrideAccess: true }).catch(() => null);
      const user = newsroomUser(starter ? { ...starter, collection: "users" } : null);
      if (!user || !atLeast(user, "administrator")) return finish(sitePage(req, "&analytics=forbidden"), clear);
      if (query.get("error") === "access_denied") return finish(sitePage(req, "&analytics=denied"), clear);
      const code = query.get("code");
      if (!code || code.length > 2048 || query.has("error") || query.getAll("state").length !== 1 || query.getAll("code").length !== 1) return finish(sitePage(req, "&analytics=failed"), clear);
      try {
        const grant = await exchangeAnalyticsCode(config, code, trip.verifier, trip.nonce);
        await storeGrant(req.payload, grant, user.id);
        return finish(sitePage(req, "&analytics=connected"), clear);
      } catch (error) {
        // Provider errors can carry the code, tokens or client credentials: log nothing from them.
        const reason = error instanceof GrantError ? error.reason : "failed";
        return finish(sitePage(req, `&analytics=${reason === "missing-scope" ? "scope" : "failed"}`), clear);
      }
    }
  },

  {
    path: "/byline/analytics/options", method: "get",
    handler: handle(async (ctx, req) => {
      administrator(ctx);
      const { token, state } = await accessToken(req.payload);
      const publication = publicationConfigFromGlobal(await readPublishedPublication(req.payload, req), 0);
      const property = req.searchParams.get("property");
      try {
        const accounts = await listAccountSummaries(token);
        if (!property) return { accounts, property: null, streams: [], recommended: null, timeZoneWarning: null, selected: { property: state.propertyResource, stream: state.streamResource } };
        if (!accounts.some((account) => account.properties.some((item) => item.property === property))) throw new AnalyticsError("property-unavailable");
        const [details, streams] = await Promise.all([getProperty(token, property), listWebStreams(token, property)]);
        const recommended = recommendStream(streams, publication.urls.publicSite);
        return { accounts, property: details, streams: streams.map((stream) => ({ ...stream, recommended: stream.stream === recommended?.stream })), recommended: recommended?.stream ?? null, timeZoneWarning: timeZoneWarning(details.timeZone, publication.timezone), selected: { property: state.propertyResource, stream: state.streamResource } };
      } catch (error) {
        if (error instanceof AnalyticsError && error.code === "needs-reconnect") await markNeedsReconnect(req.payload);
        if (error instanceof AnalyticsError) return json({ problem: error.problem }, 200);
        throw error;
      }
    })
  },

  {
    path: "/byline/analytics/select", method: "post",
    handler: handle(async (ctx, req) => {
      administrator(ctx);
      const input = await body<{ property?: unknown; stream?: unknown }>(req);
      if (typeof input.property !== "string" || !/^properties\/\d+$/.test(input.property) || typeof input.stream !== "string" || !input.stream.startsWith(`${input.property}/dataStreams/`)) throw new APIError("Choose a property and a web stream.", 400);
      const { token } = await accessToken(req.payload);
      try {
        const accounts = await listAccountSummaries(token);
        const owner = accounts.find((account) => account.properties.some((item) => item.property === input.property));
        const summary = owner?.properties.find((item) => item.property === input.property);
        if (!owner || !summary) throw new AnalyticsError("property-unavailable");
        const [details, stream] = await Promise.all([getProperty(token, input.property), getStream(token, input.stream as string)]);
        if (!stream) throw new APIError("That web stream is no longer available. Choose another.", 409);
        analyticsCache().clear();
        await patchIntegration(req.payload, {
          status: "connected", accountResource: owner.account, accountDisplayName: owner.displayName,
          propertyResource: details.property, propertyDisplayName: details.displayName || summary.displayName, propertyTimeZone: details.timeZone,
          streamResource: stream.stream, streamDisplayName: stream.displayName, streamDefaultUri: stream.defaultUri, measurementId: stream.measurementId,
          // A different Measurement ID is a public change: it shows as "Saved, not published" until it is published.
          lastErrorCode: null
        });
        return connectionDto(req);
      } catch (error) {
        if (error instanceof AnalyticsError && error.code === "needs-reconnect") await markNeedsReconnect(req.payload);
        throw error instanceof AnalyticsError ? new APIError(error.problem.title, error.code === "property-unavailable" ? 409 : 502) : error;
      }
    })
  },

  {
    path: "/byline/analytics/measurement", method: "patch",
    handler: handle(async (ctx, req) => {
      administrator(ctx);
      const input = await body<{ trackingMode?: unknown; consentMode?: unknown; publish?: unknown }>(req);
      const state = await readIntegration(req.payload);
      if (state.status !== "connected" || !state.measurementId) throw new APIError("Choose a property and web stream first.", 409);
      const trackingMode: TrackingMode = input.trackingMode === "byline" ? "byline" : "external";
      const consentMode: ConsentMode = trackingMode === "external" ? "external" : input.consentMode === "always" ? "always" : "ask";
      await patchIntegration(req.payload, { trackingMode, consentMode });
      let published: { changed: boolean; revision: number | null } | null = null;
      if (input.publish === true) published = await publishAnalyticsChoice(req, desiredPublicAnalytics({ ...state, trackingMode, consentMode }));
      return { connection: await connectionDto(req), published };
    })
  },

  {
    path: "/byline/analytics/verify", method: "post",
    handler: handle(async (ctx, req) => {
      administrator(ctx);
      return verifyConnection(req);
    })
  },

  {
    path: "/byline/analytics/connection", method: "delete",
    handler: handle(async (ctx, req) => {
      administrator(ctx);
      const before = await publishedChoice(req.payload, req);
      const { revoked } = await disconnect(req.payload);
      let publicationUpdated = true;
      if (before?.installTag) {
        try {
          await publishAnalyticsChoice(req, { installTag: false, measurementId: "", consentMode: "ask" });
        } catch {
          publicationUpdated = false;
        }
      }
      return { revoked, publicationUpdated, connection: await connectionDto(req) };
    })
  },

  { path: "/byline/analytics/overview", method: "get", handler: handle((ctx, req) => { editor(ctx); return reporting(ctx, req, (context) => overview(context, dates(req))); }) },
  { path: "/byline/analytics/realtime", method: "get", handler: handle((ctx, req) => { editor(ctx); return reporting(ctx, req, realtime); }) },
  {
    path: "/byline/analytics/content", method: "get",
    handler: handle((ctx, req) => {
      editor(ctx);
      const filters: ContentFilters = { section: req.searchParams.get("section")?.slice(0, 80) || undefined, author: intParam(req, "author"), topic: intParam(req, "topic"), story: intParam(req, "story"), q: req.searchParams.get("q")?.slice(0, 120) || undefined };
      return reporting(ctx, req, (context) => content(context, dates(req), filters));
    })
  },
  { path: "/byline/analytics/acquisition", method: "get", handler: handle((ctx, req) => { editor(ctx); return reporting(ctx, req, (context) => acquisition(context, dates(req))); }) },
  { path: "/byline/analytics/audience", method: "get", handler: handle((ctx, req) => { editor(ctx); return reporting(ctx, req, (context) => audience(context, dates(req))); }) },
  { path: "/byline/analytics/events", method: "get", handler: handle((ctx, req) => { editor(ctx); return reporting(ctx, req, (context) => events(context, dates(req))); }) },

  // Home's one compact module: omitted (null) rather than a setup warning when Analytics isn't healthy.
  {
    path: "/byline/analytics/home", method: "get",
    handler: handle(async (ctx, req): Promise<{ data: HomeAudienceDto | null }> => {
      editor(ctx);
      const result = await reporting(ctx, req, realtime);
      return { data: result.data ? homeAudience(result.data) : null };
    })
  },

  {
    path: "/byline/stories/:id/analytics", method: "get",
    handler: handle(async (ctx, req) => {
      const id = Number(req.routeParams?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new APIError("Unknown Story.", 404);
      // The same visibility the Story workspace uses: a Story this account can't open doesn't exist here.
      const [story] = await readableStories(ctx, [id], { headline: true, slug: true } as const, 0);
      if (!story) throw new APIError("Unknown Story.", 404);
      return storyAnalytics(ctx, req, story as { id: number; headline?: string; _status?: string; publishedAt?: string | null });
    })
  }
];

async function storyAnalytics(ctx: ScreenContext, req: PayloadRequest, row: { id: number; headline?: string; _status?: string; publishedAt?: string | null }): Promise<Envelope<StoryPerformanceDto> & { published: boolean }> {
  const published = row._status === "published" && Boolean(row.publishedAt);
  if (!published) return { data: null, problem: null, published: false };
  try {
    const context = await reportContext(ctx, req);
    const story = context.catalog.stories.get(row.id);
    if (!story) return { data: null, problem: null, published: false };
    const [report, live] = await Promise.all([
      storyPerformance(context, story, dates(req)),
      realtime(context).then((dto) => ({ ok: true as const, data: { readers: readersOnStory(dto, story.id) } }), (error) => ({ ok: false as const, problem: toProblem(error) }))
    ]);
    void touchSuccess(req.payload);
    return { data: { ...report, story: { ...toStoryRef(story), published: true }, readingNow: live }, problem: null, published: true };
  } catch (error) {
    if (!(error instanceof AnalyticsError)) throw error;
    return { data: null, problem: error.problem, published: true };
  }
}

/* ------------------------------------------------------------------- verify */

type CheckState = "ok" | "warn" | "fail" | "skipped";
export type VerifyDto = {
  checks: Array<{ key: "access" | "property" | "stream" | "reporting" | "tag"; label: string; state: CheckState; detail: string }>;
  summary: { state: "connected" | "connected-quiet" | "site-pending" | "needs-reconnect" | "problem"; title: string; detail: string };
  verifiedAt: string;
};

async function verifyConnection(req: PayloadRequest): Promise<VerifyDto> {
  const { payload } = req;
  const state = await readIntegration(payload);
  const checks: VerifyDto["checks"] = [];
  const push = (key: VerifyDto["checks"][number]["key"], label: string, status: CheckState, detail: string) => checks.push({ key, label, state: status, detail });
  const verifiedAt = new Date().toISOString();
  const finish = async (summary: VerifyDto["summary"]): Promise<VerifyDto> => {
    await patchIntegration(payload, { lastVerifiedAt: verifiedAt });
    return { checks, summary, verifiedAt };
  };
  if (state.status === "disconnected" || state.status === "pending-selection") {
    push("access", "Google access", "skipped", "Not connected yet.");
    return { checks, summary: { state: "problem", ...pick(problemFor("not-connected")) }, verifiedAt };
  }
  let token: string;
  try {
    token = (await accessToken(payload)).token;
    push("access", "Google access", "ok", "Byline can sign in to Google Analytics.");
  } catch (error) {
    const problem = toProblem(error);
    push("access", "Google access", "fail", problem.title);
    for (const [key, label] of [["property", "Property"], ["stream", "Web stream"], ["reporting", "Reporting"]] as const) push(key, label, "skipped", "Needs Google access.");
    push("tag", "Public tag", "skipped", "Needs Google access.");
    return finish({ state: problem.code === "needs-reconnect" ? "needs-reconnect" : "problem", ...pick(problem) });
  }
  const guard = async <T,>(key: VerifyDto["checks"][number]["key"], label: string, run: () => Promise<T>): Promise<T | null> => {
    try { return await run(); } catch (error) {
      if (error instanceof AnalyticsError && error.code === "needs-reconnect") await markNeedsReconnect(payload);
      const problem = toProblem(error);
      push(key, label, "fail", `${problem.title}. ${problem.detail}`);
      return null;
    }
  };
  const property = state.propertyResource ? await guard("property", "Property", () => getProperty(token, state.propertyResource!)) : null;
  if (property) push("property", "Property", "ok", `${property.displayName} is readable.`);
  const stream = state.streamResource && property ? await guard("stream", "Web stream", () => getStream(token, state.streamResource!)) : null;
  if (stream) {
    if (stream.measurementId === state.measurementId) push("stream", "Web stream", "ok", `${stream.displayName} · ${stream.measurementId}`);
    else push("stream", "Web stream", "fail", `The stream now reports ${stream.measurementId}, not ${state.measurementId}. Choose the property and stream again.`);
  } else if (property && !checks.some((check) => check.key === "stream")) push("stream", "Web stream", "fail", "This web stream no longer exists. Choose another.");
  let views: number | null = null;
  if (property) {
    const range = resolveRange({ preset: "7d" }, property.timeZone);
    const table = await guard("reporting", "Reporting", () => runReport(token, property.property, { dimensions: [], metrics: [analyticsMetrics.views], dateRanges: [{ startDate: range.start, endDate: range.end }], limit: 1 }));
    if (table) {
      views = table.rows[0]?.metrics[analyticsMetrics.views] ?? 0;
      push("reporting", "Reporting", "ok", "Byline can run reports for this property.");
    }
  } else push("reporting", "Reporting", "skipped", "Needs a readable property.");
  const published = await publishedChoice(payload, req);
  const publication = publicationConfigFromGlobal(await readPublishedPublication(payload, req), 0);
  let tagPending = false;
  if (state.trackingMode === "byline" && published?.installTag && state.measurementId) {
    const result = await publicTagPresent(publication.urls.publicSite, state.measurementId);
    tagPending = result === "absent";
    push("tag", "Public tag", result === "present" ? "ok" : result === "absent" ? "warn" : "skipped",
      result === "present" ? "The public site carries this Measurement ID." : result === "absent" ? "The published site doesn't carry the tag yet. The deployment may still be rolling out." : "The public site couldn't be reached to check.");
  } else if (state.trackingMode === "byline") push("tag", "Public tag", "warn", "Publish the setup to install the tag.");
  else push("tag", "Public tag", "skipped", "Tracking is managed outside Byline.");
  const failed = checks.some((check) => check.state === "fail");
  if (failed) return finish({ state: "problem", title: "Something needs attention", detail: "See the checks below." });
  if (tagPending) return finish({ state: "site-pending", title: "Site update pending", detail: "The Analytics configuration is saved but the public deployment containing the tag is not active yet." });
  if (views === 0) return finish({ state: "connected-quiet", title: "Connected · no recent traffic", detail: "Connection works; Google has not reported recent activity." });
  return finish({ state: "connected", title: "Connected", detail: "Google access and reporting are working." });
}

const pick = (problem: AnalyticsProblem) => ({ title: problem.title, detail: problem.detail });
