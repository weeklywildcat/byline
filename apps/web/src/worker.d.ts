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
};

declare const worker: {
  fetch(request: Request, env: BylineWorkerEnv): Promise<Response>;
};

export default worker;
