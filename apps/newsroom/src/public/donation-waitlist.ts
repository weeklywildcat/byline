import type { Endpoint, PayloadRequest } from "payload";
import { WEEKLY_WILDCAT_PUBLICATION } from "@byline/theme-weekly-wildcat/publication";
import { normalizeDonationEmail } from "../collections/DonationWaitlist";

const PUBLIC_ORIGIN = new URL(WEEKLY_WILDCAT_PUBLICATION.urls.publicSite).origin;
const LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LIMIT_REQUESTS = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === PUBLIC_ORIGIN || origin === PUBLIC_ORIGIN.replace("://", "://www.")) return origin;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function json(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function clientKey(req: PayloadRequest): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function limited(req: PayloadRequest): boolean {
  const now = Date.now();
  const key = clientKey(req);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  if (attempts.size > 2000) {
    for (const [entry, value] of attempts) if (value.resetAt <= now) attempts.delete(entry);
  }
  return current.count > LIMIT_REQUESTS;
}

async function joinWaitlist(req: PayloadRequest): Promise<Response> {
  const origin = allowedOrigin(req.headers.get("origin"));
  if (!origin) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (limited(req)) return json(origin, { ok: false, message: "Too many attempts. Try again later." }, 429);

  if (typeof req.text !== "function") {
    return json(origin, { ok: false, message: "Unable to process this request." }, 500);
  }
  const raw = await req.text();
  if (raw.length > 4096) return json(origin, { ok: false, message: "That request is too large." }, 413);
  const form = new URLSearchParams(raw);

  // Bots commonly fill fields people cannot see. Treat it as success so the
  // endpoint does not teach them how to bypass the trap.
  if (form.get("website")) return json(origin, { ok: true });

  let email: string;
  try {
    email = normalizeDonationEmail(form.get("email"));
  } catch (error) {
    return json(origin, { ok: false, message: error instanceof Error ? error.message : "Enter a valid email address." }, 400);
  }

  const payload = req.payload as any;
  const existing = await payload.find({
    collection: "donation-waitlist",
    where: { email: { equals: email } },
    depth: 0,
    limit: 1,
    overrideAccess: true
  });
  if (existing.docs[0]) return json(origin, { ok: true, alreadyJoined: true });

  try {
    await payload.create({
      collection: "donation-waitlist",
      data: { email },
      overrideAccess: true
    });
  } catch (error) {
    // A simultaneous duplicate submission may win the unique constraint.
    const after = await payload.find({
      collection: "donation-waitlist",
      where: { email: { equals: email } },
      depth: 0,
      limit: 1,
      overrideAccess: true
    });
    if (!after.docs[0]) throw error;
  }

  return json(origin, { ok: true });
}

export const donationWaitlistEndpoints: Endpoint[] = [
  { path: "/public/donation-waitlist", method: "post", handler: joinWaitlist }
];
