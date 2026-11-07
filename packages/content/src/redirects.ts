import { normalizeRedirectPath } from "./redirect-path";
export { normalizeRedirectPath } from "./redirect-path";

export type PermanentRedirect = { from: string; to: string; status: 301 | 308; reason: string };

export function collapseRedirects<T extends Pick<PermanentRedirect, "from" | "to">>(redirects: T[]): T[] {
  const sources = new Map<string, string>();
  const normalized = redirects.map((redirect) => {
    const from = normalizeRedirectPath(redirect.from);
    const to = normalizeRedirectPath(redirect.to);
    if (from === to) throw new Error(`Redirect source and target are identical: ${from}`);
    if (sources.has(from)) throw new Error(`Duplicate redirect source: ${from}`);
    sources.set(from, to);
    return { ...redirect, from, to };
  });
  const resolved = new Map<string, string>();
  return normalized.map((redirect) => {
    const visited = new Set<string>();
    let to = redirect.from;
    while (sources.has(to) && !resolved.has(to)) {
      if (visited.has(to)) throw new Error(`Redirect loop at ${to}`);
      visited.add(to);
      to = sources.get(to)!;
    }
    to = resolved.get(to) ?? to;
    for (const source of visited) resolved.set(source, to);
    return { ...redirect, to };
  });
}

export const validateRedirects = collapseRedirects;
export const redirects: PermanentRedirect[] = validateRedirects([]);
