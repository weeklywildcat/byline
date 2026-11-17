import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PayloadRequest } from "payload";
import { parseCookies } from "payload/shared";

/**
 * The kiosk credential (docs/wildcat-polls.md#kiosk).
 *
 * Entering kiosk mode trades the interviewer's Byline session for a random
 * bearer token in an httpOnly cookie. The server keeps only its SHA-256, so a
 * database read never yields a usable credential. The token reaches only the
 * kiosk endpoints of its one polling session; every other Byline API sees an
 * anonymous request. The interviewer's PIN is stored as a salted scrypt hash.
 */

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;

export const KIOSK_COOKIE = "byline-poll-kiosk";
/** A kiosk credential lasts one school day at most; ending the session revokes it sooner. */
export const KIOSK_LIFETIME_MS = 12 * 60 * 60 * 1000;
/** Interviewer controls lock again after this long without use. */
export const KIOSK_UNLOCK_MS = 10 * 60 * 1000;
export const PIN_PATTERN = /^\d{4,8}$/;
/** After this many wrong PINs the kiosk waits before another try; the wait doubles each time. */
export const PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 60 * 1000;
/** After this many wrong PINs in total the credential is revoked: the interviewer signs in again to recover. */
export const PIN_REVOKE_AFTER = 20;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  return PIN_PATTERN.test(pin) && verifySecret(pin, stored);
}

/** A public link's optional access code: case and spaces don't matter. */
export const normalizeAccessCode = (code: string) => code.replace(/\s+/g, "").toLowerCase();

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !secret || secret.length > 100) return false;
  const [scheme, n, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(secret, Buffer.from(salt, "base64url"), expected.length, { ...SCRYPT, N: Number(n) || SCRYPT.N });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function kioskTokenFrom(req: Pick<PayloadRequest, "headers">): string | null {
  const value = parseCookies(req.headers).get(KIOSK_COOKIE);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

const secure = () => process.env.NODE_ENV === "production";

export function kioskCookie(token: string, expires: Date): string {
  return `${KIOSK_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}${secure() ? "; Secure" : ""}`;
}

export function expiredKioskCookie(): string {
  return `${KIOSK_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure() ? "; Secure" : ""}`;
}

/**
 * The key that encrypts this session's offline queue on the device. Derived,
 * never stored: the kiosk receives it only while its credential is valid, so
 * after the session ends anything left on the device cannot be read.
 */
export function outboxKey(secret: string, sessionId: string): string {
  return createHmac("sha256", secret).update(`wildcat-polls-outbox:${sessionId}`).digest("base64url");
}

/** Public-link start tokens: random, stored hashed, spent once. */
export function publicStartToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const newPublicKey = () => randomBytes(12).toString("base64url").replace(/[-_]/g, "x").slice(0, 16);
