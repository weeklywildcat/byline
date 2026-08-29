/**
 * Opt-in browser coverage for the Gutenberg Story sidebar.
 *
 * This harness is deliberately not part of `npm test`: it needs Docker (for
 * `wp-env`) and downloaded browsers, neither of which every contributor or CI
 * runner has. See docs/gutenberg-e2e.md for the two commands that run it, and
 * for the manual QA checklist to use when the harness cannot be started.
 */
import { defineConfig, devices } from "@playwright/test";

const wordPressUrl = process.env.WP_BASE_URL ?? "http://localhost:8888";

export default defineConfig({
  testDir: __dirname,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // The editor is stateful and these specs share one post; running them in
  // parallel would make the flakiness, not the product, the thing under test.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: wordPressUrl,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"]
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
