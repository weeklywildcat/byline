import { relationId } from "../access/user";

type PageIdentity = { id: number; slug: string; parent?: unknown };

/** A missing/unpublished parent or a cycle is never a valid public page path. */
export function publicPagePaths(rows: PageIdentity[]): Map<number, string> {
  const pages = new Map(rows.map((page) => [page.id, page]));
  const paths = new Map<number, string>();
  const visiting = new Set<number>();
  function path(id: number): string {
    const known = paths.get(id);
    if (known) return known;
    const page = pages.get(id);
    if (!page?.slug || visiting.has(id)) throw new Error(`Page ${id} has no valid published parent path.`);
    visiting.add(id);
    const parent = relationId(page.parent);
    const result = `${parent == null ? "/" : path(Number(parent))}${page.slug}/`;
    visiting.delete(id);
    paths.set(id, result);
    return result;
  }
  for (const id of pages.keys()) path(id);
  return paths;
}
