import { defineConfig, devices } from "@playwright/test";

/**
 * Browser acceptance for the Story editor (docs/article-editor.md).
 *
 * Runs against a running newsroom (`npm run dev:newsroom`, or this worktree's
 * dev server) with the local administrator, editor and staff accounts from
 * apps/newsroom/.env. Each run seeds its own Media and stories through the
 * REST API and leaves them as drafts. Like the WordPress E2E suite it is not
 * part of `npm test`: it needs a real Payload, PostgreSQL and browser.
 *
 *   BYLINE_EDITOR_E2E_URL=http://localhost:3010 npm run test:browser --workspace @byline/newsroom
 *   BYLINE_PLAYWRIGHT_CHANNEL=chrome   # use the installed Chrome instead of Playwright's
 */
export default defineConfig({
  testDir: "tests/browser",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.BYLINE_EDITOR_E2E_URL ?? "http://localhost:3020",
    channel: process.env.BYLINE_PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
