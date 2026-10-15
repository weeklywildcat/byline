import type { WordPressPage } from "@/lib/wordpress";

export function getSportsArchiveHref(pages: WordPressPage[]) {
  const index = pages.find((page) => page.bylinePage?.sportsArchive?.key === "index");
  return index && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(index.slug) ? `/${index.slug}/` : "/category/sports/";
}

export function getSportsArchiveRedirects(pages: WordPressPage[]) {
  const redirects = new Map<string, string>();
  for (const page of pages) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) continue;
    for (const [path, anchor] of Object.entries(page.bylinePage?.sportsArchive?.routes ?? {})) {
      if (!/^\/sports\/(?:[a-z0-9-]+\/){0,2}$/.test(path)) continue;
      if (typeof anchor !== "string" || (anchor && !/^season-(?:\d{4}-\d{2}|undated)$/.test(anchor))) continue;
      const target = `/${page.slug}/${anchor ? `#${anchor}` : ""}`;
      if (redirects.has(path) && redirects.get(path) !== target) {
        throw new Error(`Sports archive pages claim the same historical path: ${path}`);
      }
      redirects.set(path, target);
    }
  }
  return [...redirects].map(([path, target]) => ({ path, target }));
}
