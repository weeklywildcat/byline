import type { AnalyticsErrorCode, AnalyticsProblem } from "./model";

/** Provider failures as Byline's own states. Nothing from Google's payload (or any credential) reaches a person or a log. */
const PROBLEMS: Record<AnalyticsErrorCode, Omit<AnalyticsProblem, "code">> = {
  "not-configured": { title: "Google Analytics isn't set up for this newsroom", detail: "An administrator needs to add the Google OAuth settings and BYLINE_INTEGRATIONS_SECRET. See docs/google-analytics.md.", retryable: false },
  "not-connected": { title: "Google Analytics isn't connected", detail: "Set it up in Site → Analytics.", retryable: false },
  "needs-reconnect": { title: "Google access needs to be renewed", detail: "Reconnect the Google account that owns this property.", retryable: false },
  "property-unavailable": { title: "This property is no longer available", detail: "An administrator may have removed the connected Google account's access. Choose another property.", retryable: false },
  "api-disabled": { title: "A Google Analytics API is turned off", detail: "Enable the Google Analytics Admin API and Google Analytics Data API in the Google Cloud project that owns the OAuth client.", retryable: false },
  quota: { title: "Google Analytics is busy", detail: "This property has used its report allowance for now. Try again in a few minutes.", retryable: true },
  unavailable: { title: "Google Analytics is temporarily unavailable", detail: "Try again in a moment. Results already shown are the last ones Byline had.", retryable: true },
  "bad-request": { title: "Google couldn't build that report", detail: "Try a different date range.", retryable: false },
  forbidden: { title: "You can't view this", detail: "Ask an administrator.", retryable: false }
};

export const problemFor = (code: AnalyticsErrorCode): AnalyticsProblem => ({ code, ...PROBLEMS[code] });

/** A normalized Google (or Byline integration) failure. The message is safe to log. */
export class AnalyticsError extends Error {
  constructor(readonly code: AnalyticsErrorCode, readonly status = 0, message = PROBLEMS[code].title) {
    super(message);
    this.name = "AnalyticsError";
  }
  get problem() {
    return problemFor(this.code);
  }
}

export const toProblem = (error: unknown): AnalyticsProblem => error instanceof AnalyticsError ? error.problem : problemFor("unavailable");

/**
 * Maps an HTTP failure from a Google API. `body` is only inspected for Google's structured
 * reasons; it is never copied into the result.
 */
export function classifyGoogleFailure(status: number, body: unknown): AnalyticsError {
  const error = (body as { error?: { status?: unknown; message?: unknown; details?: unknown } } | null)?.error;
  const reasons = Array.isArray(error?.details) ? error.details.map((detail) => String((detail as { reason?: unknown })?.reason ?? "")) : [];
  const message = typeof error?.message === "string" ? error.message : "";
  if (status === 401) return new AnalyticsError("needs-reconnect", status);
  if (status === 403) {
    if (reasons.includes("SERVICE_DISABLED") || /has not been used in project|is disabled|API.*not enabled/i.test(message)) return new AnalyticsError("api-disabled", status);
    if (reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || /insufficient (authentication )?scopes?/i.test(message)) return new AnalyticsError("needs-reconnect", status);
    return new AnalyticsError("property-unavailable", status);
  }
  if (status === 404) return new AnalyticsError("property-unavailable", status);
  if (status === 429 || error?.status === "RESOURCE_EXHAUSTED") return new AnalyticsError("quota", status);
  if (status === 400) return new AnalyticsError("bad-request", status);
  return new AnalyticsError("unavailable", status);
}

/** Token endpoint failures that mean "the grant is gone", not "try later". */
export function isRevokedGrant(error: unknown): boolean {
  const record = error as { response?: { data?: { error?: unknown } }; message?: unknown; code?: unknown } | null;
  const code = String(record?.response?.data?.error ?? record?.code ?? "");
  return code === "invalid_grant" || code === "invalid_token" || code === "unauthorized_client" ||
    /invalid_grant|invalid_token|token has been expired or revoked/i.test(String(record?.message ?? ""));
}
