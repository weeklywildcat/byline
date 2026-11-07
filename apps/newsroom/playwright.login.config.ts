import { defineConfig, devices } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const disabled = process.env.BYLINE_LOGIN_GOOGLE_DISABLED === "1";
const origin = "http://localhost:3013";
const fixture = pathToFileURL(resolve(import.meta.dirname, "tests/fixtures/login-provider.mjs"));

export default defineConfig({
  testDir: "tests/login-browser",
  testMatch: "login.spec.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: origin,
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node --import tsx tests/fixtures/seed-login.ts && next dev --port 3013",
    url: `${origin}/admin/login`,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.BYLINE_LOGIN_TEST_DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_login",
      PAYLOAD_SECRET: "byline-login-fixture-payload-secret-0123456789",
      BYLINE_DB_PUSH: "1",
      BYLINE_NEWSROOM_URL: origin,
      BYLINE_GOOGLE_CLIENT_ID: disabled ? "" : "byline-test.apps.googleusercontent.com",
      BYLINE_GOOGLE_CLIENT_SECRET: disabled ? "" : "fixture-google-secret",
      BYLINE_GOOGLE_HOSTED_DOMAIN: "weeklywildcat.com",
      BYLINE_UNSPLASH_ACCESS_KEY: "fixture-unsplash-private-key",
      BYLINE_LOGIN_TEST_PHOTOS: disabled ? "fail" : "success",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${fixture.href}`.trim(),
    },
  },
});
