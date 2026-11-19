export const GOOGLE_START = "/byline/auth/google";
export const GOOGLE_CALLBACK = `${GOOGLE_START}/callback`;
export const GOOGLE_BUTTON = `${GOOGLE_START}/button`;
export const GOOGLE_CREDENTIAL = `${GOOGLE_BUTTON}/credential`;

type Env = Record<string, string | undefined>;

/** The newsroom's Google OAuth client, shared by sign-in and the Analytics connection. */
export function googleOAuthCredentials(env: Env = process.env) {
  const clientId = env.BYLINE_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.BYLINE_GOOGLE_CLIENT_SECRET?.trim();
  return clientId?.endsWith(".apps.googleusercontent.com") && clientSecret ? { clientId, clientSecret } : null;
}

/** `BYLINE_NEWSROOM_URL` as an origin, only when it is https (or loopback http outside production). */
export function validatedNewsroomOrigin(env: Env = process.env): URL | null {
  try {
    const origin = new URL(env.BYLINE_NEWSROOM_URL ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.protocol !== "https:" &&
        !(origin.protocol === "http:" && loopback && env.NODE_ENV !== "production")) return null;
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return null;
    return origin;
  } catch {
    return null;
  }
}

export function googleConfig(apiPath: string, env: Env = process.env) {
  const credentials = googleOAuthCredentials(env);
  const hostedDomain = env.BYLINE_GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase();
  const origin = validatedNewsroomOrigin(env);
  if (!credentials || !hostedDomain || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(hostedDomain) || !origin) return null;
  return { ...credentials, hostedDomain, secure: origin.protocol === "https:", callback: new URL(apiPath + GOOGLE_CALLBACK, origin).href };
}

/** Accept only paths inside the newsroom; never redirect through a supplied origin. */
export function newsroomReturnTo(value: unknown, admin: string): string {
  if (typeof value !== "string" || value.length > 1000 || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return admin;
  try {
    const url = new URL(value, "https://byline.invalid");
    if (url.origin !== "https://byline.invalid" || /%2f|%5c|%25/i.test(url.pathname)) return admin;
    if (url.pathname !== admin && !url.pathname.startsWith(`${admin}/`)) return admin;
    return url.pathname + url.search + url.hash;
  } catch {
    return admin;
  }
}
