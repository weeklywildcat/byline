export const VOTER_COOKIE_NAME = "ww_voter_id";
export const POLL_VOTED_COOKIE_PREFIX = "ww_poll_voted_";
export const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type CookieAttributes = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAge?: number;
};

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

export function serializeCookie(name: string, value: string, attributes: CookieAttributes = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (attributes.maxAge !== undefined) {
    parts.push(`Max-Age=${attributes.maxAge}`);
  }

  if (attributes.path) {
    parts.push(`Path=${attributes.path}`);
  }

  if (attributes.httpOnly) {
    parts.push("HttpOnly");
  }

  if (attributes.secure) {
    parts.push("Secure");
  }

  if (attributes.sameSite) {
    parts.push(`SameSite=${attributes.sameSite}`);
  }

  return parts.join("; ");
}

export function buildVoterCookie(value: string) {
  return serializeCookie(VOTER_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: VOTER_COOKIE_MAX_AGE
  });
}

export function buildPollVotedCookie(pollId: string) {
  return serializeCookie(getPollVotedCookieName(pollId), "true", {
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: VOTER_COOKIE_MAX_AGE
  });
}

export function createVoterId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

export async function signVoterId(voterId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(voterId));

  return `${voterId}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function readSignedVoterId(cookieHeader: string | null | undefined, secret: string) {
  const value = parseCookieHeader(cookieHeader).get(VOTER_COOKIE_NAME);

  if (!value) {
    return null;
  }

  const [voterId, signature, ...extra] = value.split(".");

  if (!voterId || !signature || extra.length > 0) {
    return null;
  }

  const expected = await signVoterId(voterId, secret);
  const expectedSignature = expected.split(".")[1];

  return constantTimeEqual(signature, expectedSignature) ? voterId : null;
}

export async function hashVoterKey(voterId: string, secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${voterId}`));

  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
