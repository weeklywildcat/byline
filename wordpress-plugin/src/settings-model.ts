/** Pure helpers for editor-friendly publication settings. */

export function slugifySectionName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function sectionSlugForName(name: string, currentSlug: string, mode: "auto" | "manual"): string {
  return mode === "auto" ? slugifySectionName(name) : currentSlug;
}

export function navigationConflictKey(item: {
  url: string;
  locations: string[];
}): string {
  return `${item.url.trim().toLowerCase()}|${[...item.locations].sort().join(",")}`;
}

export type NavigationItem = {
  label: string;
  url: string;
  locations: Array<"header" | "footer">;
};

export function createNavigationItem(
  target: string,
  sections: Array<{ name: string; slug: string }>,
  pages: Array<{ id: number; title: string; url: string }>
): NavigationItem | null {
  const sectionSlug = target.startsWith("section:") ? target.slice("section:".length) : "";
  const section = sections.find((candidate) => candidate.slug === sectionSlug);
  if (section) {
    return {
      label: section.name,
      url: section.slug === "sports" ? "/sports/" : `/category/${section.slug.replace(/^\/+|\/+$/g, "")}/`,
      locations: ["header"]
    };
  }

  const pageId = target.startsWith("page:") ? Number(target.slice("page:".length)) : 0;
  const page = pages.find((candidate) => candidate.id === pageId && candidate.url);
  if (page) return { label: page.title, url: page.url, locations: ["header"] };

  if (target === "__custom__") return { label: "", url: "/", locations: ["header"] };
  return null;
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (index < 0 || index >= items.length || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}
