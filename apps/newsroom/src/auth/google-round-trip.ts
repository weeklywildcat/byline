import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { generateCookie } from "payload/shared";

const lifetime = 10 * 60;
const random = () => randomBytes(32).toString("base64url");
const secretPart = /^[A-Za-z0-9_-]{43}$/;

function same(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const sign = (value: string, secret: string) =>
  createHmac("sha256", secret).update(`byline-google-round-trip:${value}`).digest("base64url");

export function beginGoogleRoundTrip(returnTo: string, secret: string) {
  const state = random(), nonce = random(), verifier = random();
  const payload = Buffer.from(JSON.stringify({ state, nonce, verifier, returnTo, expires: Date.now() + lifetime * 1000 })).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, nonce, challenge, value: `${payload}.${sign(payload, secret)}` };
}

export function readGoogleRoundTrip(cookie: string | undefined, state: string | null, secret: string) {
  if (!cookie || cookie.length > 2500 || !state || !secretPart.test(state)) return null;
  const [payload, mac, extra] = cookie.split(".");
  if (!payload || !mac || extra !== undefined || !same(sign(payload, secret), mac)) return null;
  try {
    const trip = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!secretPart.test(trip.state) || !secretPart.test(trip.nonce) ||
        !secretPart.test(trip.verifier) || !Number.isSafeInteger(trip.expires) ||
        trip.expires <= Date.now() || typeof trip.returnTo !== "string" || !same(trip.state, state)) return null;
    return { nonce: trip.nonce as string, verifier: trip.verifier as string, returnTo: trip.returnTo };
  } catch {
    return null;
  }
}

export function googleCookieName(secure: boolean, flow: "code" | "button" = "code") {
  return `${secure ? "__Host-" : ""}byline-google${flow === "button" ? "-button" : ""}`;
}

/** The short-lived OAuth transaction cookie is separate from Payload's auth cookie. */
export function googleCookie(secure: boolean, value?: string, flow: "code" | "button" = "code") {
  return generateCookie<false>({
    name: googleCookieName(secure, flow), value, httpOnly: true, sameSite: "Lax", secure,
    path: "/", expires: new Date(value ? Date.now() + lifetime * 1000 : 0),
    returnCookieAsObject: false,
  });
}
