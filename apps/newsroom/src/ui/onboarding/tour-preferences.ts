/**
 * Whether the welcome introduction is due, from two private records:
 *
 * - the account's own Payload Preference (this key): finished or skipped, and
 *   which administrator request it answered. It follows the account across
 *   devices and is never a Users field.
 * - `users.welcomeOnboardingRequestedAt`: when an administrator last asked for
 *   the welcome to show again (People → Newsroom access).
 *
 * A future feature introduction gets its own key; changing this tour's steps
 * or copy never makes anyone see it again.
 */
export const WELCOME_ONBOARDING_PREFERENCE = "byline:onboarding:welcome:v1";

export type OnboardingOutcome = "completed" | "skipped";

export type WelcomeOnboardingPreference = {
  schema: 1;
  status: OnboardingOutcome;
  finishedAt: string;
  acknowledgedRequestAt: string | null;
};

/** A valid instant as canonical ISO text, else null. */
export function normalizeInstant(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** The stored preference if it is one this version understands; anything else reads as no record at all. */
export function normalizeWelcomePreference(value: unknown): WelcomeOnboardingPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schema !== 1) return null;
  if (record.status !== "completed" && record.status !== "skipped") return null;
  const finishedAt = normalizeInstant(record.finishedAt);
  if (!finishedAt) return null;
  const acknowledged = record.acknowledgedRequestAt === null || record.acknowledgedRequestAt === undefined ? null : normalizeInstant(record.acknowledgedRequestAt);
  if (acknowledged === null && record.acknowledgedRequestAt !== null && record.acknowledgedRequestAt !== undefined) return null;
  return { schema: 1, status: record.status, finishedAt, acknowledgedRequestAt: acknowledged };
}

/**
 * Whether Byline should greet the account on its own: never finished or
 * skipped, or an administrator asked again since the last time.
 */
export function welcomeIsDue(preference: unknown, requestedAt: unknown): boolean {
  const stored = normalizeWelcomePreference(preference);
  if (!stored) return true;
  const request = normalizeInstant(requestedAt);
  return request !== null && request !== stored.acknowledgedRequestAt;
}

/**
 * The record to store when the person finishes or explicitly skips. It
 * acknowledges the current administrator request, so the same request never
 * reopens the welcome. Skipping a replay never turns a finished tour into a
 * skipped one.
 */
export function welcomePreferenceAfter(outcome: OnboardingOutcome, previous: unknown, requestedAt: unknown, now: Date = new Date()): WelcomeOnboardingPreference {
  const stored = normalizeWelcomePreference(previous);
  const status = outcome === "skipped" && stored?.status === "completed" ? "completed" : outcome;
  return { schema: 1, status, finishedAt: now.toISOString(), acknowledgedRequestAt: normalizeInstant(requestedAt) };
}
