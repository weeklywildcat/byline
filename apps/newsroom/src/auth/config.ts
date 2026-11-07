export const GOOGLE_START = "/byline/auth/google";
export const GOOGLE_CALLBACK = `${GOOGLE_START}/callback`;
export const GOOGLE_BUTTON = `${GOOGLE_START}/button`;
export const GOOGLE_CREDENTIAL = `${GOOGLE_BUTTON}/credential`;

export function googleConfig(apiPath: string, env = process.env) {
  const clientId = env.BYLINE_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.BYLINE_GOOGLE_CLIENT_SECRET?.trim();
  const hostedDomain = env.BYLINE_GOOGLE_HOSTED_DOMAIN?.trim().toLowerCase();
  if (!clientId?.endsWith(".apps.googleusercontent.com") || !clientSecret ||
      !hostedDomain || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(hostedDomain)) return null;

  try {
    const origin = new URL(env.BYLINE_NEWSROOM_URL ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.protocol !== "https:" &&
        !(origin.protocol === "http:" && loopback && env.NODE_ENV !== "production")) return null;
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return null;
    return {
      clientId, clientSecret, hostedDomain,
      secure: origin.protocol === "https:",
      callback: new URL(apiPath + GOOGLE_CALLBACK, origin).href,
    };
  } catch {
    return null;
  }
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
