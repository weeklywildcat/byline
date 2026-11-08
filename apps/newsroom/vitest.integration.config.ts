import { defineConfig } from "vitest/config";

/** Runs Payload against a real, throwaway PostgreSQL database (see tests/integration/setup.ts). */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false
  }
});
