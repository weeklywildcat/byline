// Byline static export depends on required publication data being genuinely
// resolvable. Historically these loaders used `.catch(() => [])`, which turned a
// CMS/API outage into a legitimate-looking empty dataset. Next then failed much
// later and much less usefully with "generateStaticParams() returned an empty
// array", pointing at the route instead of the endpoint that actually broke.
//
// This module keeps the two states distinct:
//   - the endpoint answered, and the publication genuinely has no rows  -> []
//   - the endpoint failed, was unreachable, or was malformed           -> throw
export class BylineBuildDataError extends Error {
  readonly endpoint: string;

  constructor(endpoint: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);

    super(
      `Byline build data request failed for ${endpoint}: ${detail}\n` +
        `This is a required build input, so the static export was stopped instead of ` +
        `continuing with empty data. Verify the endpoint is reachable and returns JSON.`
    );
    this.name = "BylineBuildDataError";
    this.endpoint = endpoint;
    if (cause instanceof Error) this.cause = cause;
  }
}

// Wraps a required build-data fetch so any failure is attributed to a named
// endpoint rather than being swallowed into an empty array.
export async function requireBuildData<T>(endpoint: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    throw new BylineBuildDataError(endpoint, cause);
  }
}

// Optional modules (a plugin that is not installed on a given publication) are
// allowed to be absent, but only for a declared reason. The absence is reported
// so a build log still shows the module was skipped rather than silently empty.
export async function optionalBuildData<T>(endpoint: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.warn(`[byline] optional build data unavailable for ${endpoint}; continuing without it. ${detail}`);
    return fallback;
  }
}
