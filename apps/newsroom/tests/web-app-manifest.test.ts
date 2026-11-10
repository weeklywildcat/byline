import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "../src/app/(payload)/admin/manifest.webmanifest/route";
import { webAppManifest, WEB_APP_ICON_BASE } from "../src/newsroom/web-app-manifest";

const app = path.join(import.meta.dirname, "..");

describe("web app manifest", () => {
  it("gives the newsroom a stable standalone identity under /admin", () => {
    const manifest = webAppManifest();
    expect(manifest).toMatchObject({ id: "/admin", name: "Byline — Weekly Wildcat", short_name: "Byline", start_url: "/admin", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#ffffff" });
    // The start URL must be inside the scope or browsers ignore the manifest.
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("serves JSON as a manifest, publicly cacheable", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    expect((await response.json()).icons).toHaveLength(2);
  });

  it("declares only icons that exist and are the public site's own artwork", () => {
    for (const icon of webAppManifest().icons) {
      const file = path.join(app, "public", icon.src);
      expect(readFileSync(file).equals(readFileSync(path.join(app, "..", "web", "public", path.basename(icon.src))))).toBe(true);
    }
    for (const name of ["apple-touch-icon.png", "favicon-32.png"]) {
      expect(readFileSync(path.join(app, "public", WEB_APP_ICON_BASE, name)).equals(readFileSync(path.join(app, "..", "web", "public", name)))).toBe(true);
    }
  });

  it("is wired into the admin metadata without the deprecated translucent status bar", () => {
    const config = readFileSync(path.join(app, "src", "payload.config.ts"), "utf8");
    expect(config).toContain("manifest: WEB_APP_MANIFEST_PATH");
    expect(config).toContain('rel: "apple-touch-icon"');
    expect(config).not.toMatch(/^\s*statusBarStyle\s*:/m);
    expect(config).not.toMatch(/black-translucent/);
    expect(readFileSync(path.join(app, "src", "app", "(payload)", "layout.tsx"), "utf8")).toContain('viewportFit: "cover"');
  });
});
