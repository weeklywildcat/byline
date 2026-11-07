import { createHash, timingSafeEqual } from "node:crypto";
import type { PayloadRequest } from "payload";

/**
 * The static build's credential: one `BYLINE_BUILD_TOKEN` for every build-only
 * endpoint (prepared media, snapshot discovery, snapshot artifacts and
 * direct-source recovery). Not part of the signed-in newsroom.
 *
 * - Only `Authorization: Bearer <token>`; never a query parameter.
 * - Compared in constant time (both sides hashed first), never logged.
 * - Without a configured token (or one shorter than 32 characters) the build
 *   endpoints do not exist (404) and expose nothing; the newsroom runs normally.
 */
export const MIN_BUILD_TOKEN_LENGTH = 32;
export const BUILD_NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function buildTokenConfigured(configured: string | undefined): configured is string {
  return typeof configured === "string" && configured.length >= MIN_BUILD_TOKEN_LENGTH;
}

/** Constant-time comparison of a presented bearer credential with the configured one. */
export function buildTokenMatches(presented: string | null | undefined, configured: string | undefined): boolean {
  if (!buildTokenConfigured(configured) || !presented) return false;
  return timingSafeEqual(digest(presented), digest(configured));
}

export function bearerToken(req: Pick<PayloadRequest, "headers">): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export function buildRefusal(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: BUILD_NO_STORE });
}

/**
 * The common gate for a build-only request: a Response to send when the
 * request may not proceed (no token configured → 404, missing/wrong token →
 * 401), or null when it is authenticated.
 */
export function authenticateBuildRequest(req: Pick<PayloadRequest, "headers">, env: Record<string, string | undefined> = process.env): Response | null {
  const configured = env.BYLINE_BUILD_TOKEN;
  if (!buildTokenConfigured(configured)) return buildRefusal(404, { message: "Not found." });
  if (!buildTokenMatches(bearerToken(req), configured)) return buildRefusal(401, { code: "byline_build_unauthorized", message: "A build credential is required." });
  return null;
}
