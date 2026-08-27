/**
 * Type surface for the plain-JavaScript Cloudflare Worker entrypoint.
 *
 * The Worker stays JavaScript because that is what wrangler deploys; this
 * declaration is what lets the TypeScript test suite drive it.
 */
type BylineWorkerEnv = {
  /** Static asset binding for the Next.js export. */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Optional CMS origin override; otherwise read from the published publication. */
  BYLINE_CMS_URL?: string;
  /** Cloudflare Access service token for a protected CMS origin. */
  BYLINE_CMS_ACCESS_CLIENT_ID?: string;
  BYLINE_CMS_ACCESS_CLIENT_SECRET?: string;
  /** Provider-neutral upstream auth header for a protected CMS origin. */
  BYLINE_CMS_AUTH_HEADER?: string;
  BYLINE_CMS_AUTH_VALUE?: string;
  /** Shared secret proving to WordPress that this proxy is the caller. */
  BYLINE_POLL_PROXY_SECRET?: string;
  /** Cutover write freeze: refuse votes while a final delta is handed over. */
  BYLINE_POLL_FREEZE_VOTES?: string;
};

declare const worker: {
  fetch(request: Request, env: BylineWorkerEnv): Promise<Response>;
};

export default worker;
