import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.BYLINE_BROWSER_PORT || 4173);
const baseURL = "http://127.0.0.1:" + port;

export default defineConfig({
  testDir: path.resolve(__dirname, "tests/browser"),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"]
  },
  webServer: {
    command: "node scripts/serve-static.mjs",
    cwd: path.resolve(__dirname),
    url: baseURL + "/",
    // The test must exercise the output produced by the preceding fixture
    // build. Reusing an arbitrary process already listening on this port can
    // silently serve a different directory or an older build.
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
