import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Google Analytics in the newsroom end to end (docs/google-analytics.md): the Site → Analytics setup, the
 * Analytics desk and a Story's Performance, against a throwaway database seeded by
 * scripts/seed-analytics-browser.ts. Google is never contacted: the dev server preloads
 * tests/support/google-preload.mjs, which answers every Google request, and the browser's redirect to Google's
 * consent page is answered by the spec.
 *
 *   npm run test:analytics:browser --workspace @byline/newsroom
 *
 * Starts its own dev server on port 3095 unless BYLINE_ANALYTICS_BROWSER_REUSE=1. Chromium uses
 * PLAYWRIGHT_CHROMIUM_CHANNEL (e.g. `chrome`) when set. Point BYLINE_ANALYTICS_BROWSER_DATABASE_URL at any
 * PostgreSQL named byline_newsroom_test_analytics_browser*.
 */
const database = process.env.BYLINE_ANALYTICS_BROWSER_DATABASE_URL ?? "postgres://localhost:5432/byline_newsroom_test_analytics_browser";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "analytics.spec.ts",
  outputDir: "/private/tmp/byline-analytics-playwright-results",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: "http://localhost:3095", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL } }],
  webServer: {
    command: "npm run seed:analytics:browser && next dev --port 3095",
    cwd: import.meta.dirname,
    url: "http://localhost:3095/admin/login",
    reuseExistingServer: process.env.BYLINE_ANALYTICS_BROWSER_REUSE === "1",
    timeout: 240_000,
    env: {
      PAYLOAD_SECRET: "analytics-browser-fixture-secret-0123456789",
      DATABASE_URL: database,
      BYLINE_DB_PUSH: "0",
      BYLINE_NEWSROOM_URL: "http://localhost:3095",
      NEXT_TELEMETRY_DISABLED: "1",
      BYLINE_GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      BYLINE_GOOGLE_CLIENT_SECRET: "analytics-browser-client-secret",
      BYLINE_INTEGRATIONS_SECRET: "analytics-browser-integrations-secret-0123456789",
      NODE_OPTIONS: `--import=${path.resolve(import.meta.dirname, "tests/support/google-preload.mjs")}`
    }
  }
});
