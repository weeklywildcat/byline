import { googleOAuthCredentials, validatedNewsroomOrigin } from "../auth/config";

/** The Analytics grant is a separate OAuth transaction from newsroom sign-in. */
export const ANALYTICS_START = "/byline/analytics/connect";
export const ANALYTICS_CALLBACK = "/byline/analytics/callback";

/** Read-only. Never `analytics.edit`. */
export const ANALYTICS_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/analytics.readonly"] as const;
export const ANALYTICS_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/**
 * OAuth settings for the Analytics connection. It shares the newsroom's Google OAuth client and validated
 * origin, but NOT sign-in's hosted-domain rule: the property may belong to an unrelated Google account.
 */
export function analyticsOAuthConfig(apiPath: string, env: Record<string, string | undefined> = process.env) {
  const credentials = googleOAuthCredentials(env);
  const origin = validatedNewsroomOrigin(env);
  if (!credentials || !origin) return null;
  return { ...credentials, secure: origin.protocol === "https:", callback: new URL(apiPath + ANALYTICS_CALLBACK, origin).href };
}

export type AnalyticsOAuthConfig = NonNullable<ReturnType<typeof analyticsOAuthConfig>>;

/** The dedicated encryption secret, or null when not configured. */
export function integrationsSecret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.BYLINE_INTEGRATIONS_SECRET?.trim();
  return value ? value : null;
}

export function analyticsSetupProblems(apiPath: string, env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  if (!analyticsOAuthConfig(apiPath, env)) problems.push("Google OAuth is not configured (BYLINE_GOOGLE_CLIENT_ID, BYLINE_GOOGLE_CLIENT_SECRET and BYLINE_NEWSROOM_URL).");
  const secret = integrationsSecret(env);
  if (!secret) problems.push("BYLINE_INTEGRATIONS_SECRET is not set.");
  else if (secret.length < 32) problems.push("BYLINE_INTEGRATIONS_SECRET must be at least 32 characters.");
  return problems;
}
