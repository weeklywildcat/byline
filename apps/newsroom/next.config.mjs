import { withPayload } from "@payloadcms/next/withPayload";

/** The private newsroom. The public newspaper is apps/web (Astro); nothing here is public reading. */
const nextConfig = {
  // The design system and the shared article packages ship TypeScript source.
  transpilePackages: ["@byline/newsroom-ui", "@byline/newsroom-screens", "@byline/admin-runtime", "@byline/core", "@byline/article-body", "@byline/content", "@byline/editor", "@byline/story-presentations", "@byline/ui", "@byline/theme-weekly-wildcat", "@byline/theme-contract"],
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/", destination: "/admin", permanent: false }];
  },
  async headers() {
    // Nothing on this host is meant for search engines.
    return [
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
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
