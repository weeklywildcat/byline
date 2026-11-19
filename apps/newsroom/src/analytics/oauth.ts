import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { ANALYTICS_SCOPES, ANALYTICS_READONLY_SCOPE, type AnalyticsOAuthConfig } from "./config";
import { beginGoogleRoundTrip, readGoogleRoundTrip } from "../auth/google-round-trip";

/**
 * The Analytics OAuth grant: authorization code + PKCE S256, a cryptographically random state and
 * nonce, and a signed HttpOnly round-trip cookie that is bound to the signed-in Byline
 * administrator. It never uses newsroom sign-in's hosted-domain rule.
 */

/** Domain-separated from sign-in's own round-trip signatures. */
export const analyticsRoundTripSecret = (payloadSecret: string) => `byline-analytics:${payloadSecret}`;

export function analyticsClient(config: AnalyticsOAuthConfig) {
  return new OAuth2Client({
    clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.callback,
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    transporterOptions: { timeout: 8_000, fetchImplementation: (...args) => fetch(...args) }
  });
}

export function beginAnalyticsGrant(config: AnalyticsOAuthConfig, payloadSecret: string, input: { userId: number | string; returnTo: string }) {
  const trip = beginGoogleRoundTrip(input.returnTo, analyticsRoundTripSecret(payloadSecret), String(input.userId));
  const url = analyticsClient(config).generateAuthUrl({
    response_type: "code",
    scope: [...ANALYTICS_SCOPES],
    access_type: "offline",
    include_granted_scopes: true,
    // An explicit Connect or Reconnect must end with a usable refresh token.
    prompt: "consent",
    state: trip.state,
    nonce: trip.nonce,
    code_challenge: trip.challenge,
    code_challenge_method: CodeChallengeMethod.S256
  });
  return { url, cookie: trip.value };
}

/**
 * The callback arrives as a cross-site navigation from Google, and Payload (rightly) doesn't honor the session
 * cookie on those, so who the administrator is comes from the transaction itself: the signed, HttpOnly,
 * single-purpose cookie issued to the administrator who started it. It is accepted only with the state this
 * browser holds, and if the browser *does* present a session it must be the same administrator.
 */
export function acceptAnalyticsCallback(input: { cookie: string | undefined; state: string | null; payloadSecret: string; sessionUserId?: number | string | null }) {
  const trip = readGoogleRoundTrip(input.cookie, input.state, analyticsRoundTripSecret(input.payloadSecret));
  if (!trip || trip.binding === "") return null;
  if (input.sessionUserId !== undefined && input.sessionUserId !== null && String(input.sessionUserId) !== trip.binding) return null;
  return trip;
}

export type AnalyticsGrant = { refreshToken: string; email: string; subject: string; scopes: string[] };

/** Exchanges the code and verifies the identity. Throws without ever including provider payloads. */
export async function exchangeAnalyticsCode(config: AnalyticsOAuthConfig, code: string, verifier: string, nonce: string): Promise<AnalyticsGrant> {
  const client = analyticsClient(config);
  const { tokens } = await client.getToken({ code, codeVerifier: verifier });
  if (!tokens.refresh_token) throw new GrantError("no-refresh-token");
  const scopes = String(tokens.scope ?? "").split(/\s+/).filter(Boolean);
  if (!scopes.includes(ANALYTICS_READONLY_SCOPE)) throw new GrantError("missing-scope");
  if (!tokens.id_token) throw new GrantError("no-identity");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
  const claims = ticket.getPayload();
  if (!claims || claims.nonce !== nonce || typeof claims.sub !== "string" || typeof claims.email !== "string" || claims.email_verified !== true) throw new GrantError("bad-identity");
  return { refreshToken: tokens.refresh_token, email: claims.email.trim().toLowerCase(), subject: claims.sub, scopes };
}

export class GrantError extends Error {
  constructor(readonly reason: "no-refresh-token" | "missing-scope" | "no-identity" | "bad-identity") {
    super(`Google authorization could not be completed (${reason}).`);
  }
}
