import type { DataPresentationClient } from "./sdk";

/**
 * Starting a page's presentation enhancement, shared by both hosts. The host
 * supplies only how to load a key's `client.ts` (Vite's glob, Next's dynamic
 * import); finding the root and reading its release paths is the same.
 */
export async function startDataPresentation(article: HTMLElement, load: (key: string) => Promise<{ default: DataPresentationClient }> | undefined): Promise<(() => void) | undefined> {
  const key = article.dataset.dataPresentation ?? "";
  const root = article.querySelector<HTMLElement>("[data-data-root]");
  const loading = key ? load(key) : undefined;
  if (!root || !loading) return undefined;
  let releases: Record<string, string> = {};
  try {
    const parsed = JSON.parse(root.dataset.dataReleases ?? "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) releases = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string" && /^\/_byline\/data\/[0-9a-f]{64}\.json$/.test(value as string))) as Record<string, string>;
  } catch {
    releases = {};
  }
  const { default: enhance } = await loading;
  const cleanup = enhance(root, { releases });
  return typeof cleanup === "function" ? cleanup : undefined;
}

export type { DataPresentationClient };
