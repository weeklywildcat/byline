/**
 * Byline static-site Worker.
 *
 * Everything except the poll API is served straight from the static export.
 * The poll routes are a thin same-origin proxy in front of the WordPress poll
 * API: WordPress owns poll definitions, lifecycle, results, and vote records,
 * and this Worker owns no poll business logic, no SQL, and no database binding.
 *
 * Keeping the browser on the publication domain is what makes poll cookies
 * first-party, keeps CORS out of the picture, and keeps the CMS hostname an
 * implementation detail.
 */

// Public cookie names, mirrored from lib/voter-cookie.ts. Only these are
// forwarded upstream or emitted back to the browser.
const VOTER_COOKIE_NAME = "ww_voter_id";
const POLL_VOTED_COOKIE_PREFIX = "ww_poll_voted_";

const CMS_POLL_API_BASE = "/wp-json/byline/v1";

// Only these exact public paths are proxied, each to one fixed upstream route.
// There is deliberately no pattern that could forward an arbitrary /api path or
// an attacker-chosen upstream URL.
const POLL_ROUTES = {
  "/api/polls/active": { method: "GET", upstream: `${CMS_POLL_API_BASE}/polls/active` },
  "/api/polls/vote": { method: "POST", upstream: `${CMS_POLL_API_BASE}/polls/vote` }
};

const PUBLICATION_MANIFEST_PATH = "/_byline/publication.json";

let resolvedCmsOrigin;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = POLL_ROUTES[url.pathname];

    if (route) {
      return handlePollRoute(request, env, route);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handlePollRoute(request, env, route) {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (request.method !== route.method) {
    return json({ error: "Method not allowed." }, 405, {
      Allow: `${route.method}, OPTIONS`
    });
  }

  const origin = await cmsOrigin(request, env);

  if (!origin) {
    return json({ error: "Poll service is unavailable." }, 502);
  }

  return proxyToCms(request, origin + route.upstream);
}

/**
 * Resolve the CMS origin without hardcoding any publication's hostname.
 *
 * BYLINE_CMS_URL is the explicit per-deployment mechanism. When it is not set,
 * the origin is read from the publication manifest that every static export
 * already publishes, so a correctly built site needs no Worker configuration at
 * all.
 */
async function cmsOrigin(request, env) {
  if (typeof env.BYLINE_CMS_URL === "string" && env.BYLINE_CMS_URL !== "") {
    return normalizeOrigin(env.BYLINE_CMS_URL);
  }

  if (resolvedCmsOrigin !== undefined) {
    return resolvedCmsOrigin;
  }

  resolvedCmsOrigin = "";

  try {
    const manifestUrl = new URL(PUBLICATION_MANIFEST_PATH, request.url);
    const response = await env.ASSETS.fetch(new Request(manifestUrl.toString(), { method: "GET" }));

    if (response.ok) {
      const publication = await response.json();
      resolvedCmsOrigin = normalizeOrigin(publication?.urls?.cms);
    }
  } catch {
    resolvedCmsOrigin = "";
  }

  return resolvedCmsOrigin;
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || value === "") {
    return "";
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

async function proxyToCms(request, upstreamUrl) {
  const headers = new Headers({ Accept: "application/json" });
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const cookie = forwardablePollCookies(request.headers.get("cookie"));

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  // Cloudflare sets this at the edge, so it cannot be spoofed by the browser.
  // WordPress uses it only for short-window throttling and never stores it.
  const clientIp = request.headers.get("cf-connecting-ip");

  if (clientIp) {
    headers.set("CF-Connecting-IP", clientIp);
  }

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  let upstream;

  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual"
    });
  } catch {
    return json({ error: "Poll service is unavailable." }, 502);
  }

  const text = await upstream.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    // A CMS outage, WAF interstitial, or HTML error page must not leak through
    // as a poll response.
    return json({ error: "Poll service is unavailable." }, 502);
  }

  return json(payload, upstream.status, {}, publicSetCookies(upstream));
}

/**
 * Forward only the poll cookies. Any other cookie the publication sets stays on
 * the publication and never reaches the CMS.
 */
function forwardablePollCookies(cookieHeader) {
  if (!cookieHeader) {
    return "";
  }

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => isPollCookieName(cookie.split("=")[0].trim()))
    .join("; ");
}

function isPollCookieName(name) {
  return name === VOTER_COOKIE_NAME || name.startsWith(POLL_VOTED_COOKIE_PREFIX);
}

/**
 * Re-emit the CMS's poll cookies for the public domain.
 *
 * WordPress writes host-agnostic cookies (no Domain attribute) so the browser
 * binds them to the publication host it actually talked to. This function
 * enforces that plus the publication's cookie policy, and keeps HttpOnly
 * exactly as WordPress set it: the voter id is HttpOnly, while the readable
 * "already voted" marker deliberately is not, because the poll widget checks it
 * client-side.
 */
function publicSetCookies(upstream) {
  const cookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];

  return cookies
    .map((cookie) => {
      const parts = cookie
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      const pair = parts.shift() || "";

      if (!isPollCookieName(pair.split("=")[0].trim())) {
        return "";
      }

      const preserved = parts.filter(
        (part) => !/^domain=/i.test(part) && !/^path=/i.test(part) && !/^samesite=/i.test(part) && !/^secure$/i.test(part)
      );

      return [pair, ...preserved, "Path=/", "Secure", "SameSite=Lax"].join("; ");
    })
    .filter((cookie) => cookie !== "");
}

function json(body, status = 200, headers = {}, setCookies = []) {
  const responseHeaders = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });

  setCookies.forEach((cookie) => {
    responseHeaders.append("Set-Cookie", cookie);
  });

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders
  });
}
