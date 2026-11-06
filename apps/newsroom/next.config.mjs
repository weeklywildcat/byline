import { withPayload } from "@payloadcms/next/withPayload";

/** The private newsroom. The public newspaper is apps/web (Astro); nothing here is public reading. */
const nextConfig = {
  // The design system ships TypeScript source.
  transpilePackages: ["@byline/newsroom-ui"],
  poweredByHeader: false,
  async headers() {
    // Nothing on this host is meant for search engines.
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  }
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
