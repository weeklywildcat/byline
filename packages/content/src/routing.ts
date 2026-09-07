export type RouteKind =
  | "home" | "article" | "page" | "category" | "author" | "coverage"
  | "sports" | "search" | "feed" | "sitemap" | "robots" | "not-found" | "other";

export type RouteManifestEntry = {
  path: string;
  kind: RouteKind;
  digest?: string;
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
