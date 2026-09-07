import { normalizePublicRoute } from "./routing";

export type PermanentRedirect = { from: string; to: string; status: 301 | 308; reason: string };

export function validateRedirects(redirects: PermanentRedirect[]) {
  const sources = new Set<string>();
  return redirects.map((redirect) => {
    const from = normalizePublicRoute(redirect.from);
    const to = normalizePublicRoute(redirect.to);
    if (from === to) throw new Error(`Redirect source and target are identical: ${from}`);
    if (sources.has(from)) throw new Error(`Duplicate redirect source: ${from}`);
    sources.add(from);
    return { ...redirect, from, to };
  });
}

/** Public URL changes must be registered here with a reason. */
export const redirects: PermanentRedirect[] = validateRedirects([]);
