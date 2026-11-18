import { createHmac, randomInt } from "node:crypto";

/**
 * Device pairing codes (docs/wildcat-polls.md#pairing-a-device).
 *
 * A signed-in interviewer prepares a fieldwork session in Poll Studio and gets
 * a six-digit code (shown as `482 913`), lasting as long as they choose, up to
 * two days, so an iPad can be set up ahead of time. The iPad types it at
 * `/poll` and receives the session's kiosk credential without anyone signing
 * in to Byline on it. In the spirit of an RFC 8628 user code:
 *
 * - digits only, easy to read aloud and type on any keyboard;
 * - spent by the first successful claim, and replaced by any newer code for
 *   the same session;
 * - never stored: the server keeps only an HMAC keyed with the newsroom's
 *   secret, so a database read gives neither the code nor a way to test
 *   guesses offline (a million codes would fall to an unkeyed hash at once);
 * - failed claims are throttled across the whole newsroom, because the
 *   claiming device is anonymous and a short code can't survive unlimited
 *   guessing. At 20 failures per 10 minutes, a code left live for the full two
 *   days could be hit by at most 5,760 guesses: under a 0.6% chance. Even then
 *   the device starts locked behind the interviewer's PIN, which has its own
 *   lockout.
 *
 * The code is not a credential once it has been used: claiming clears it and
 * issues the kiosk's own high-entropy credential in an httpOnly cookie.
 */

export const PAIRING_CODE_LENGTH = 6;
/** How long a code may last: at least 5 minutes, at most 2 days; 1 hour unless the interviewer chooses. */
export const PAIRING_MIN_MS = 5 * 60 * 1000;
export const PAIRING_MAX_MS = 2 * 24 * 60 * 60 * 1000;
export const PAIRING_DEFAULT_MS = 60 * 60 * 1000;

/** Failed claims allowed across the newsroom in one window before claiming pauses until the next. */
export const PAIRING_FAILURES_PER_WINDOW = 20;
export const PAIRING_WINDOW_MS = 10 * 60 * 1000;

export const PAIRING_PATTERN = /^\d{6}$/;

/** A new code, uniformly drawn (`randomInt` has no modulo bias), leading zeros allowed. */
export function newPairingCode(): string {
  return String(randomInt(1_000_000)).padStart(PAIRING_CODE_LENGTH, "0");
}

/** `482913` → `482 913`, the way people read and type it. */
export const formatPairingCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * When a new code stops working: `expiresInMinutes` from now, kept between
 * 5 minutes and 2 days; an hour when nothing usable is given.
 */
export function pairingExpiry(now: Date, expiresInMinutes: unknown): Date {
  const minutes = Number(expiresInMinutes);
  const ms = Number.isFinite(minutes) && minutes > 0 ? Math.min(PAIRING_MAX_MS, Math.max(PAIRING_MIN_MS, Math.round(minutes) * 60_000)) : PAIRING_DEFAULT_MS;
  return new Date(now.getTime() + ms);
}

/**
 * What a person typed, as a code: spaces and dashes don't matter.
 * Anything that isn't a well-formed code is null and is never looked up.
 */
export function normalizePairingCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const code = input.replace(/[\s\-–—_.]/g, "");
  return PAIRING_PATTERN.test(code) ? code : null;
}

/** The only form of the code the server keeps. Keyed, so it can't be brute-forced from a database copy. */
export function hashPairingCode(secret: string, code: string): string {
  return createHmac("sha256", secret).update(`wildcat-polls-pairing:${code}`).digest("hex");
}

/** The window a failed claim is counted in. */
export const pairingWindow = (now: Date) => new Date(Math.floor(now.getTime() / PAIRING_WINDOW_MS) * PAIRING_WINDOW_MS);
