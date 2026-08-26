import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import nextConfig from "@/next.config";

describe("static frontend contract", () => {
  it("retains static export, canonical trailing slashes, and unoptimized images", () => {
    expect(nextConfig.output).toBe("export");
    expect(nextConfig.trailingSlash).toBe(true);
    expect(nextConfig.images).toMatchObject({ unoptimized: true });
  });

  it("does not rely on Next.js server route handlers", () => {
    expect(existsSync(path.join(process.cwd(), "app", "api", "polls", "active", "route.ts"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "app", "api", "polls", "vote", "route.ts"))).toBe(false);
  });
});
