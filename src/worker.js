const KIT_API_BASE = "https://api.kit.com/v4";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VOTER_COOKIE_NAME = "ww_voter_id";
const POLL_VOTED_COOKIE_PREFIX = "ww_poll_voted_";
const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/polls/active") {
      return handleActivePoll(request, env);
    }

    if (url.pathname === "/api/polls/vote") {
      return handlePollVote(request, env);
    }

    if (url.pathname === "/api/subscribe") {
      return handleSubscribe(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleActivePoll(request, env) {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405, {
      Allow: "GET, OPTIONS"
    });
  }

  const db = getPollDatabase(env);

  if (!db) {
    return json({ error: "Poll database is not configured." }, 500);
  }

  const poll = await getActivePoll(db);

  if (!poll) {
    return json({ error: "No active poll is available." }, 404);
  }

  return json(poll);
}

async function handlePollVote(request, env) {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, {
      Allow: "POST, OPTIONS"
    });
  }

  const db = getPollDatabase(env);

  if (!db) {
    return json({ error: "Poll database is not configured." }, 500);
  }

  let payload;

  try {
    payload = await readPayload(request);
  } catch {
    return json({ error: "Send a valid vote request." }, 400);
  }

  const result = await submitPollVote({
    db,
    pollId: payload.pollId,
    optionId: payload.optionId,
    cookieHeader: request.headers.get("cookie"),
    env
  });
  const body = result.ok ? result.poll : { error: result.error, poll: result.poll };

  return json(body, result.ok ? 200 : result.status, {}, result.setCookies || []);
}

async function handleSubscribe(request, env) {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405, {
      Allow: "POST, OPTIONS"
    });
  }

  let payload;

  try {
    payload = await readPayload(request);
  } catch {
    return json({ ok: false, error: "Send a valid signup request." }, 400);
  }

  const email = normalizeString(payload.email || payload.email_address).toLowerCase();
  const trap = normalizeString(payload.company || payload.website || payload.trap);
  const turnstileToken = normalizeString(payload.turnstileToken || payload["cf-turnstile-response"]);

  if (trap) {
    return json({ ok: true });
  }

  if (!isValidEmail(email)) {
    return json({ ok: false, error: "Enter a valid email address." }, 400);
  }

  const config = getSubscribeConfig(env);

  if (!config.turnstileSecretKey) {
    return json({ ok: false, error: "Newsletter signup security is not configured yet." }, 500);
  }

  if (!turnstileToken) {
    return json({ ok: false, error: "Complete the security check to sign up." }, 400);
  }

  const turnstileResult = await verifyTurnstile(turnstileToken, request, config.turnstileSecretKey);

  if (!turnstileResult.success) {
    console.warn("Turnstile verification failed", {
      errors: turnstileResult["error-codes"] || [],
      hostname: turnstileResult.hostname,
      action: turnstileResult.action
    });
    return json({ ok: false, error: "The security check expired. Please try again." }, 400);
  }

  if (turnstileResult.action && turnstileResult.action !== "newsletter") {
    console.warn("Turnstile action mismatch", {
      action: turnstileResult.action
    });
    return json({ ok: false, error: "The security check could not be verified." }, 400);
  }

  if (!config.kitApiKey || !config.kitFormId) {
    return json({ ok: false, error: "Newsletter signup is not configured yet." }, 500);
  }

  const kitResponse = await fetch(`${KIT_API_BASE}/forms/${encodeURIComponent(config.kitFormId)}/subscribers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": config.kitApiKey
    },
    body: JSON.stringify({
      email_address: email,
      referrer: getReferrer(payload.source, request)
    })
  });

  if (kitResponse.ok) {
    return json({ ok: true });
  }

  const responseText = await kitResponse.text().catch(() => "");
  console.error("Kit signup failed", {
    status: kitResponse.status,
    response: responseText.slice(0, 500)
  });

  return json(
    {
      ok: false,
      error:
        kitResponse.status === 422
          ? "Kit could not accept that email address."
          : "We could not add that email right now."
    },
    kitResponse.status === 422 ? 400 : 502
  );
}

function getSubscribeConfig(env) {
  return {
    turnstileSecretKey: getWorkerEnvString(env, "TURNSTILE_SECRET_KEY"),
    kitApiKey: getWorkerEnvString(env, "KIT_API_KEY"),
    kitFormId: getWorkerEnvString(env, "KIT_FORM_ID")
  };
}

function getWorkerEnvString(env, name) {
  if (!env || typeof env !== "object") {
    return "";
  }

  const value = env[name];

  if (typeof value === "string") {
    return value.trim();
  }

  const matchingEntry = Object.entries(env).find(([key]) => key.trim() === name);
  const matchingValue = matchingEntry ? matchingEntry[1] : "";

  return typeof matchingValue === "string" ? matchingValue.trim() : "";
}

async function verifyTurnstile(token, request, secretKey) {
  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      secret: secretKey,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || undefined
    })
  });

  if (!response.ok) {
    return { success: false, "error-codes": ["siteverify-request-failed"] };
  }

  return response.json();
}

async function readPayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

function getReferrer(source, request) {
  const fallback = request.headers.get("referer") || request.url;
  const value = normalizeString(source) || fallback;

  try {
    return new URL(value, request.url).toString().slice(0, 500);
  } catch {
    return new URL(fallback, request.url).toString().slice(0, 500);
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function getPollDatabase(env) {
  return env.POLLS_DB || env.DB || null;
}

async function getActivePoll(db) {
  const now = new Date().toISOString();
  const poll = await db
    .prepare(
      `SELECT id, question
       FROM polls
       WHERE status = 'open'
         AND (opens_at IS NULL OR opens_at <= ?)
         AND (closes_at IS NULL OR closes_at > ?)
       ORDER BY COALESCE(opens_at, created_at) DESC, created_at DESC
       LIMIT 1`
    )
    .bind(now, now)
    .first();

  return poll ? getPollWithTotals(db, poll.id, poll) : null;
}

async function getOpenPollById(db, pollId) {
  const now = new Date().toISOString();
  const poll = await db
    .prepare(
      `SELECT id, question
       FROM polls
       WHERE id = ?
         AND status = 'open'
         AND (opens_at IS NULL OR opens_at <= ?)
         AND (closes_at IS NULL OR closes_at > ?)
       LIMIT 1`
    )
    .bind(pollId, now, now)
    .first();

  return poll ? getPollWithTotals(db, poll.id, poll) : null;
}

async function getPollWithTotals(db, pollId, pollRow) {
  const poll = pollRow || (await db.prepare("SELECT id, question FROM polls WHERE id = ? LIMIT 1").bind(pollId).first());

  if (!poll) {
    return null;
  }

  const optionRows = await db
    .prepare(
      `SELECT poll_options.id, poll_options.label, COUNT(poll_votes.id) AS votes
       FROM poll_options
       LEFT JOIN poll_votes ON poll_votes.option_id = poll_options.id
       WHERE poll_options.poll_id = ?
       GROUP BY poll_options.id, poll_options.label, poll_options.position
       ORDER BY poll_options.position ASC, poll_options.id ASC`
    )
    .bind(pollId)
    .all();
  const options = (optionRows.results || []).map((option) => ({
    id: option.id,
    label: option.label,
    votes: Number(option.votes) || 0
  }));

  return {
    id: poll.id,
    question: poll.question,
    options,
    totalVotes: options.reduce((total, option) => total + option.votes, 0)
  };
}

async function submitPollVote({ db, pollId, optionId, cookieHeader, env }) {
  if (typeof pollId !== "string" || typeof optionId !== "string" || !pollId || !optionId) {
    return { ok: false, status: 400, error: "Choose a poll option before voting." };
  }

  const secret = env.POLL_COOKIE_SECRET || env.VOTER_COOKIE_SECRET || "";

  if (!secret) {
    return { ok: false, status: 500, error: "Poll voting is not configured yet." };
  }

  const poll = await getOpenPollById(db, pollId);

  if (!poll) {
    return { ok: false, status: 404, error: "Poll is not open." };
  }

  if (!poll.options.some((option) => option.id === optionId)) {
    return { ok: false, status: 400, error: "That answer does not belong to this poll." };
  }

  let voterId = await readSignedVoterId(cookieHeader, secret);
  const setCookies = [];

  if (!voterId) {
    voterId = createVoterId();
    setCookies.push(buildVoterCookie(await signVoterId(voterId, secret)));
  }

  const voterKey = await hashVoterKey(voterId, secret);

  try {
    await db
      .prepare("INSERT INTO poll_votes (id, poll_id, option_id, voter_key) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), pollId, optionId, voterKey)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const updatedPoll = (await getPollWithTotals(db, pollId, poll)) || poll;
    const votedCookie = buildPollVotedCookie(pollId);

    if (/unique|constraint/i.test(message)) {
      return {
        ok: false,
        status: 409,
        error: "Already voted.",
        poll: updatedPoll,
        setCookies: [...setCookies, votedCookie]
      };
    }

    throw error;
  }

  return {
    ok: true,
    poll: (await getPollWithTotals(db, pollId, poll)) || poll,
    setCookies: [...setCookies, buildPollVotedCookie(pollId)]
  };
}

function parseCookieHeader(cookieHeader) {
  const cookies = new Map();

  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(";").forEach((cookie) => {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    const name = rawName && rawName.trim();

    if (name) {
      cookies.set(name, decodeURIComponent(rawValue.join("=")));
    }
  });

  return cookies;
}

function getPollVotedCookieName(pollId) {
  return `${POLL_VOTED_COOKIE_PREFIX}${pollId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function serializeCookie(name, value, attributes = {}) {
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

function buildVoterCookie(value) {
  return serializeCookie(VOTER_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: VOTER_COOKIE_MAX_AGE
  });
}

function buildPollVotedCookie(pollId) {
  return serializeCookie(getPollVotedCookieName(pollId), "true", {
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: VOTER_COOKIE_MAX_AGE
  });
}

function createVoterId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

async function signVoterId(voterId, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(voterId));

  return `${voterId}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function readSignedVoterId(cookieHeader, secret) {
  const value = parseCookieHeader(cookieHeader).get(VOTER_COOKIE_NAME);

  if (!value) {
    return null;
  }

  const [voterId, signature, ...extra] = value.split(".");

  if (!voterId || !signature || extra.length > 0) {
    return null;
  }

  const expectedSignature = (await signVoterId(voterId, secret)).split(".")[1];

  return constantTimeEqual(signature, expectedSignature) ? voterId : null;
}

async function hashVoterKey(voterId, secret) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${voterId}`));

  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(bytes) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
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
