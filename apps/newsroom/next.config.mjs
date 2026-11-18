import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const activeReleasePointer = path.join(appRoot, ".next", "active-release");
const releasePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/;

function newsroomDistDir() {
  const explicit = process.env.BYLINE_NEXT_DIST_DIR?.trim();
  if (explicit) return explicit;

  // A normal local/manual build remains the conventional .next directory.
  // Production deploys set BYLINE_NEXT_DIST_DIR to a versioned release path.
  const building = process.env.npm_lifecycle_event === "build" || process.argv.includes("build");
  if (building) return ".next";

  // Production start reads the tiny activation pointer once. The previous
  // server keeps its already-resolved distDir while a new release builds.
  try {
    const release = readFileSync(activeReleasePointer, "utf8").trim();
    if (releasePattern.test(release)) return path.posix.join(".next", "releases", release);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return ".next";
}

/** The private newsroom. The public newspaper is apps/web (Astro); nothing here is public reading. */
const nextConfig = {
  distDir: newsroomDistDir(),
  // The design system and the shared article packages ship TypeScript source.
  transpilePackages: ["@byline/newsroom-ui", "@byline/newsroom-screens", "@byline/admin-runtime", "@byline/core", "@byline/article-body", "@byline/content", "@byline/editor", "@byline/story-presentations", "@byline/ui", "@byline/theme-weekly-wildcat", "@byline/theme-contract"],
  poweredByHeader: false,
  experimental: {
    // Next 16.3+ can persist Turbopack's production compiler cache. The deploy
    // release helper seeds each versioned build from the previous release.
    turbopackFileSystemCacheForBuild: true
  },
  async redirects() {
    return [{ source: "/", destination: "/admin", permanent: false }];
  },
  async headers() {
    // Nothing on this host is meant for search engines.
    return [
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // Wildcat Polls' respondent routes (/poll, /poll/<key>, /polls/*): never cached, never framed, never leaking a referrer.
      ...["/poll", "/poll/:path*", "/polls/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      })),
      {
        // Poll Studio shows results: a kiosk's Back button must never bring a cached copy back.
        source: "/admin/polls",
        headers: [{ key: "Cache-Control", value: "private, no-store" }]
      },
      {
        // Live Preview's page shows unpublished stories: never cached, never indexed,
        // and framed only by this origin (Payload's own preview iframe or pop-out).
        source: "/preview/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }
        ]
      }
    ];
  }
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
