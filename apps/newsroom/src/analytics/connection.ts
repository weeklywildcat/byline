import type { Payload } from "payload";
import { OAuth2Client } from "google-auth-library";
import { ANALYTICS_INTEGRATION_GLOBAL, type AnalyticsStatus } from "../globals/AnalyticsIntegration";
import { analyticsOAuthConfig, integrationsSecret } from "./config";
import { decryptSecret, encryptSecret, isEncryptedEnvelope, type EncryptedEnvelope } from "./crypto";
import { AnalyticsError, isRevokedGrant } from "./errors";
import { analyticsCache } from "./cache";
import { analyticsClient } from "./oauth";

type Row = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

export type TrackingMode = "external" | "byline";
export type ConsentMode = "external" | "always" | "ask";

/** The integration as the server uses it. The refresh token stays an envelope here. */
export type IntegrationState = {
  status: AnalyticsStatus;
  googleAccountEmail: string | null;
  googleSubject: string | null;
  accountResource: string | null;
  accountDisplayName: string | null;
  propertyResource: string | null;
  propertyDisplayName: string | null;
  propertyTimeZone: string | null;
  streamResource: string | null;
  streamDisplayName: string | null;
  streamDefaultUri: string | null;
  measurementId: string | null;
  trackingMode: TrackingMode;
  consentMode: ConsentMode;
  encryptedRefreshToken: EncryptedEnvelope | null;
  grantedScopes: string[];
  connectedAt: string | null;
  connectedBy: number | string | null;
  lastVerifiedAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastErrorCode: string | null;
};

export function normalizeIntegration(row: Row | null | undefined): IntegrationState {
  const record = row ?? {};
  const status = record.status === "pending-selection" || record.status === "connected" || record.status === "needs-reconnect" ? record.status : "disconnected";
  const connectedBy = record.connectedBy && typeof record.connectedBy === "object" ? (record.connectedBy as Row).id : record.connectedBy;
  return {
    status,
    googleAccountEmail: str(record.googleAccountEmail), googleSubject: str(record.googleSubject),
    accountResource: str(record.accountResource), accountDisplayName: str(record.accountDisplayName),
    propertyResource: str(record.propertyResource), propertyDisplayName: str(record.propertyDisplayName), propertyTimeZone: str(record.propertyTimeZone),
    streamResource: str(record.streamResource), streamDisplayName: str(record.streamDisplayName), streamDefaultUri: str(record.streamDefaultUri), measurementId: str(record.measurementId),
    trackingMode: record.trackingMode === "byline" ? "byline" : "external",
    consentMode: record.consentMode === "always" || record.consentMode === "ask" ? record.consentMode : "external",
    encryptedRefreshToken: isEncryptedEnvelope(record.encryptedRefreshToken) ? record.encryptedRefreshToken : null,
    grantedScopes: Array.isArray(record.grantedScopes) ? record.grantedScopes.filter((scope): scope is string => typeof scope === "string") : [],
    connectedAt: str(record.connectedAt), connectedBy: typeof connectedBy === "number" || typeof connectedBy === "string" ? connectedBy : null,
    lastVerifiedAt: str(record.lastVerifiedAt), lastSuccessfulRequestAt: str(record.lastSuccessfulRequestAt), lastErrorCode: str(record.lastErrorCode)
  };
}

export async function readIntegration(payload: Payload): Promise<IntegrationState> {
  const row = await payload.findGlobal({ slug: ANALYTICS_INTEGRATION_GLOBAL, depth: 0, overrideAccess: true });
  return normalizeIntegration(row as unknown as Row);
}

export async function patchIntegration(payload: Payload, patch: Partial<IntegrationState>): Promise<IntegrationState> {
  const row = await payload.updateGlobal({ slug: ANALYTICS_INTEGRATION_GLOBAL, data: patch as never, depth: 0, overrideAccess: true });
  return normalizeIntegration(row as unknown as Row);
}

function secretOrThrow(): string {
  const secret = integrationsSecret();
  if (!secret) throw new AnalyticsError("not-configured");
  return secret;
}

/** Stores a completed grant, encrypted. The caller still has to choose a property. */
export async function storeGrant(payload: Payload, grant: { refreshToken: string; email: string; subject: string; scopes: string[] }, userId: number | string) {
  const previous = await readIntegration(payload);
  const sameGoogleAccount = previous.googleSubject === grant.subject;
  analyticsCache().clear();
  accessTokens.clear();
  return patchIntegration(payload, {
    status: sameGoogleAccount && previous.propertyResource && previous.streamResource ? "connected" : "pending-selection",
    googleAccountEmail: grant.email, googleSubject: grant.subject,
    // Reconnecting the same Google account keeps the chosen property; a different account must choose again.
    ...(sameGoogleAccount ? {} : { accountResource: null, accountDisplayName: null, propertyResource: null, propertyDisplayName: null, propertyTimeZone: null, streamResource: null, streamDisplayName: null, streamDefaultUri: null, measurementId: null }),
    encryptedRefreshToken: encryptSecret(grant.refreshToken, secretOrThrow()),
    grantedScopes: grant.scopes, connectedAt: new Date().toISOString(), connectedBy: userId, lastErrorCode: null
  });
}

const accessTokens = new Map<string, { token: string; expiresAt: number }>();
/** Drops cached access tokens (a new grant, a disconnect, or a test). */
export const forgetAccessTokens = () => accessTokens.clear();
const refreshing = new Map<string, Promise<string>>();

/**
 * A usable access token. Refresh failures that mean the grant is gone (`invalid_grant`, revoked
 * authorization) become the recoverable `needs-reconnect` state, never a 500. A rotated refresh
 * token from Google is stored (encrypted) before it is used.
 */
export async function accessToken(payload: Payload): Promise<{ token: string; state: IntegrationState }> {
  const state = await readIntegration(payload);
  if (state.status === "disconnected" || !state.encryptedRefreshToken) throw new AnalyticsError("not-connected");
  if (state.status === "needs-reconnect") throw new AnalyticsError("needs-reconnect");
  const key = state.encryptedRefreshToken.ciphertext;
  const hit = accessTokens.get(key);
  if (hit && hit.expiresAt - 60_000 > Date.now()) return { token: hit.token, state };
  let flight = refreshing.get(key);
  if (!flight) {
    flight = refresh(payload, state).finally(() => refreshing.delete(key));
    refreshing.set(key, flight);
  }
  return { token: await flight, state };
}

async function refresh(payload: Payload, state: IntegrationState): Promise<string> {
  const config = analyticsOAuthConfig(payload.config.routes.api);
  if (!config) throw new AnalyticsError("not-configured");
  const secret = secretOrThrow();
  const client: OAuth2Client = analyticsClient(config);
  const stored = state.encryptedRefreshToken!;
  client.setCredentials({ refresh_token: decryptSecret(stored, secret) });
  let rotated: string | null = null;
  client.on("tokens", (tokens) => { if (tokens.refresh_token) rotated = tokens.refresh_token; });
  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) throw new AnalyticsError("unavailable");
    if (rotated) await patchIntegration(payload, { encryptedRefreshToken: encryptSecret(rotated, secret) });
    accessTokens.set(stored.ciphertext, { token: credentials.access_token, expiresAt: credentials.expiry_date ?? Date.now() + 50 * 60_000 });
    return credentials.access_token;
  } catch (error) {
    if (error instanceof AnalyticsError) throw error;
    if (isRevokedGrant(error)) {
      await markNeedsReconnect(payload);
      throw new AnalyticsError("needs-reconnect");
    }
    // Never log the provider's error: it can carry credentials.
    payload.logger.warn({ msg: "Google Analytics token refresh failed" });
    throw new AnalyticsError("unavailable");
  }
}

export async function markNeedsReconnect(payload: Payload) {
  accessTokens.clear();
  await patchIntegration(payload, { status: "needs-reconnect", lastErrorCode: "needs-reconnect" });
}

/** Records a successful Google request without a write on every report (at most once a minute). */
let lastTouch = 0;
export async function touchSuccess(payload: Payload) {
  if (Date.now() - lastTouch < 60_000) return;
  lastTouch = Date.now();
  await patchIntegration(payload, { lastSuccessfulRequestAt: new Date().toISOString(), lastErrorCode: null }).catch(() => undefined);
}

/** Revokes at Google when possible and always clears the local credential and selection. */
export async function disconnect(payload: Payload): Promise<{ revoked: boolean }> {
  const state = await readIntegration(payload);
  let revoked = false;
  const secret = integrationsSecret();
  if (state.encryptedRefreshToken && secret) {
    try {
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(state.encryptedRefreshToken, secret) }),
        signal: AbortSignal.timeout(8_000)
      });
      revoked = response.ok;
    } catch {
      revoked = false;
    }
  }
  accessTokens.clear();
  analyticsCache().clear();
  await patchIntegration(payload, {
    status: "disconnected", googleAccountEmail: null, googleSubject: null, accountResource: null, accountDisplayName: null,
    propertyResource: null, propertyDisplayName: null, propertyTimeZone: null, streamResource: null, streamDisplayName: null,
    streamDefaultUri: null, measurementId: null, trackingMode: "external", consentMode: "external",
    encryptedRefreshToken: null, grantedScopes: [], connectedAt: null, connectedBy: null, lastVerifiedAt: null,
    lastSuccessfulRequestAt: null, lastErrorCode: null
  });
  return { revoked };
}

/** The reporting target, or the reason there is none. */
export async function reportingTarget(payload: Payload): Promise<{ token: string; property: string; timeZone: string; state: IntegrationState }> {
  const { token, state } = await accessToken(payload);
  if (state.status !== "connected" || !state.propertyResource) throw new AnalyticsError("not-connected");
  return { token, property: state.propertyResource, timeZone: state.propertyTimeZone ?? "UTC", state };
}
