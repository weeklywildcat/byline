import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import nextConfig from "@/next.config";
// @ts-ignore Build verifier is a plain Node .mjs module without TypeScript declarations.
import { redactAllowedPublicNewsroomReferences } from "../scripts/verify-static-export.mjs";

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
  it("allows only the intentionally public newsroom APIs in generated files", () => {
    const cms = "https://byline.weeklywildcat.com";
    const checked = redactAllowedPublicNewsroomReferences([
      `${cms}/api/byline/live/60`,
      `${cms}/api/byline/live/60/media?path=%2F_byline%2Fmedia%2Fimages%2Faa%2Fphoto.webp`,
      `${cms}/api/public/donation-waitlist`,
      `${cms}/api/byline/live/60/private`,
      `${cms}/api/stories/60`,
      `${cms}/admin`
    ].join("\n"), cms);

    expect(checked).not.toContain(`${cms}/api/byline/live/60\n`);
    expect(checked).not.toContain(`${cms}/api/byline/live/60/media`);
    expect(checked).not.toContain(`${cms}/api/public/donation-waitlist`);
    expect(checked).toContain(`${cms}/api/byline/live/60/private`);
    expect(checked).toContain(`${cms}/api/stories/60`);
    expect(checked).toContain(`${cms}/admin`);
  });
});
