export type RouteKind =
  | "home" | "article" | "page" | "category" | "author" | "coverage"
  | "redirect" | "sports" | "search" | "feed" | "sitemap" | "robots" | "not-found" | "other";

export type RouteManifestEntry = {
  path: string;
  kind: RouteKind;
  digest?: string;
  redirectTo?: string;
  /**
   * How a redirect is delivered. "static" (the default) is a generated HTML page;
   * "edge" is a real HTTP redirect rule in out/_redirects with no file of its own.
   */
  delivery?: "static" | "edge";
};

export function normalizePublicRoute(value: string) {
  const parsed = new URL(value, "https://byline.invalid");
  let pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (pathname !== "/" && !pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(pathname)) pathname += "/";
  return pathname;
}
export function buildRouteManifest(entries: Iterable<RouteManifestEntry>) {
  const routes = new Map<string, RouteManifestEntry>();
  for (const entry of entries) {
    const path = normalizePublicRoute(entry.path);
    if (routes.has(path)) throw new Error(`Duplicate public route: ${path}`);
    routes.set(path, { ...entry, path });
  }
  return [...routes.values()].sort((left, right) => left.path.localeCompare(right.path));
}

/** Institutional addresses the public Astro application owns in code. */
export const CODE_ROUTED_PAGE_SLUGS: readonly string[] = ["about", "join", "diversity-inclusion", "off-deadline"];
export const REDIRECTED_PAGE_SLUGS: Readonly<Record<string, string>> = {
  "media-assets": "/media-kit/",
  "behind-the-scenes": "/off-deadline/"
};
/** Fixed, generated content (excluding aliases and error pages). */
export const FIXED_PUBLIC_CONTENT_ROUTES: readonly RouteManifestEntry[] = [
  { path: "/", kind: "home" },
  { path: "/staff/", kind: "author" },
  { path: "/corrections/", kind: "other" },
  { path: "/coverage/", kind: "coverage" },
  ...CODE_ROUTED_PAGE_SLUGS.map((slug): RouteManifestEntry => ({ path: `/${slug}/`, kind: "page" })),
  { path: "/media-kit/", kind: "page" },
  { path: "/open-source/", kind: "page" },
  { path: "/intranet/", kind: "page" },
  { path: "/search/", kind: "search" },
  { path: "/stories/", kind: "other" },
  { path: "/watch/", kind: "other" },
  { path: "/feed.xml", kind: "feed" },
  { path: "/news-sitemap.xml", kind: "feed" },
  { path: "/video-sitemap.xml", kind: "feed" },
  { path: "/sitemap.xml", kind: "sitemap" },
  { path: "/robots.txt", kind: "robots" }
];

const codePaths = new Set([
  ...FIXED_PUBLIC_CONTENT_ROUTES.map(({ path }) => path),
  ...Object.keys(REDIRECTED_PAGE_SLUGS).map((slug) => `/${slug}/`),
  "/authors/", "/sports/", "/sports/schedule/", "/404/", "/404.html"
]);

export function isCodeOwnedPublicPath(path: string): boolean {
  return codePaths.has(path) || /^\/(?:api|_astro|brand|wp-content|media)\//.test(path);
}
