import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsOAuthConfig } from "../../src/analytics/config";
import { exchangeAnalyticsCode, GrantError } from "../../src/analytics/oauth";
import { createGoogleFake } from "../support/google-fake.mjs";

/** The real google-auth-library against a fake Google that signs real RS256 ID tokens. */
const env = { BYLINE_GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com", BYLINE_GOOGLE_CLIENT_SECRET: "client-secret-value", BYLINE_NEWSROOM_URL: "https://newsroom.example.com" };
const config = analyticsOAuthConfig("/api", env)!;
const NONCE = "n".repeat(43);

afterEach(() => vi.unstubAllGlobals());

function withGoogle(adjust?: (state: ReturnType<typeof createGoogleFake>["state"]) => void) {
  const google = createGoogleFake();
  google.state.clientId = env.BYLINE_GOOGLE_CLIENT_ID;
  adjust?.(google.state);
  vi.stubGlobal("fetch", google.fake);
  return google;
}

describe("exchanging the authorization code", () => {
  it("returns a refresh token and a verified identity for a read-only grant", async () => {
    withGoogle();
    await expect(exchangeAnalyticsCode(config, `fake-code.${NONCE}`, "v".repeat(43), NONCE)).resolves.toMatchObject({
      refreshToken: "1//SECRET-REFRESH-TOKEN-VALUE", email: "owner@gmail.com", subject: "google-sub-1",
      scopes: expect.arrayContaining(["https://www.googleapis.com/auth/analytics.readonly"])
    });
  });

  it("refuses a different nonce, a missing read-only scope and a missing refresh token", async () => {
    withGoogle();
    await expect(exchangeAnalyticsCode(config, `fake-code.${NONCE}`, "v".repeat(43), "x".repeat(43))).rejects.toMatchObject({ reason: "bad-identity" });
    withGoogle((state) => { state.grantedScope = "openid email"; });
    await expect(exchangeAnalyticsCode(config, `fake-code.${NONCE}`, "v".repeat(43), NONCE)).rejects.toMatchObject({ reason: "missing-scope" });
    withGoogle((state) => { state.refreshToken = ""; });
    await expect(exchangeAnalyticsCode(config, `fake-code.${NONCE}`, "v".repeat(43), NONCE)).rejects.toBeInstanceOf(GrantError);
  });

  it("refuses an ID token for another OAuth client", async () => {
    withGoogle((state) => { state.clientId = "999.apps.googleusercontent.com"; });
    await expect(exchangeAnalyticsCode(config, `fake-code.${NONCE}`, "v".repeat(43), NONCE)).rejects.toBeTruthy();
  });
});
