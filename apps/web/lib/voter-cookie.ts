/**
 * Public poll cookie names.
 *
 * Signing, verification, and voter-key derivation now live in WordPress, which
 * is the only component that holds the poll signing secret. What remains here is
 * the small amount the static frontend genuinely needs: the cookie names, which
 * are a preserved public contract, and the client-readable "already voted"
 * marker the poll widget checks.
 */

export const VOTER_COOKIE_NAME = "ww_voter_id";
export const POLL_VOTED_COOKIE_PREFIX = "ww_poll_voted_";

export function parseCookieHeader(cookieHeader: string | null | undefined) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(";").forEach((cookie) => {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    const name = rawName?.trim();

    if (!name) {
      return;
    }

    cookies.set(name, decodeURIComponent(rawValue.join("=")));
  });

  return cookies;
}

export function getPollVotedCookieName(pollId: string) {
  return `${POLL_VOTED_COOKIE_PREFIX}${pollId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function isPollCookieName(name: string) {
  return name === VOTER_COOKIE_NAME || name.startsWith(POLL_VOTED_COOKIE_PREFIX);
}
