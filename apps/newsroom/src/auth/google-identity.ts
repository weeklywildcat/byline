import { OAuth2Client, type TokenPayload } from "google-auth-library";
import type { googleConfig } from "./config";

type GoogleConfig = NonNullable<ReturnType<typeof googleConfig>>;
export type GoogleIdentity = { subject: string; email: string };

const issuers = ["https://accounts.google.com", "accounts.google.com"];
let cached: { config: GoogleConfig; client: OAuth2Client } | undefined;

export function googleClient(config: GoogleConfig) {
  if (cached && cached.config.clientId === config.clientId && cached.config.clientSecret === config.clientSecret &&
      cached.config.callback === config.callback) return cached.client;
  const client = new OAuth2Client({
    clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.callback,
    issuers,
    transporterOptions: { timeout: 5_000, fetchImplementation: (...args) => fetch(...args) },
  });
  cached = { config, client };
  return client;
}

/** Only call with claims from Google's signature/audience/issuer verifier. */
export function googleIdentity(claims: TokenPayload | undefined, nonce: string, hostedDomain: string): GoogleIdentity | null {
  // The library allows clock skew for exp; Byline requires a currently valid token.
  if (!claims || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000 ||
      claims.nonce !== nonce || claims.hd !== hostedDomain || claims.email_verified !== true ||
      typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub) ||
      typeof claims.email !== "string") return null;
  const email = claims.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { email, subject: claims.sub };
}

export async function verifyGoogleCode(config: GoogleConfig, code: string, verifier: string, nonce: string) {
  const client = googleClient(config);
  const { tokens } = await client.getToken({ code, codeVerifier: verifier });
  if (!tokens.id_token) return null;
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
  return googleIdentity(ticket.getPayload(), nonce, config.hostedDomain);
}
