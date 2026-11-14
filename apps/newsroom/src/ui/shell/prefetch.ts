import type { PrefetchOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";

export type RoutePrefetcher = {
  prefetch?: (href: string, options?: PrefetchOptions) => void;
};

/**
 * Ask Next for the full dynamic route when the host router supports it.
 * Keeping the private PrefetchOptions cast in one place makes the behavior
 * easy to replace when Next exposes a public equivalent.
 */
export function prefetchFullRoute(router: RoutePrefetcher, href: string): boolean {
  if (typeof router.prefetch !== "function") return false;
  router.prefetch(href, { kind: "full" } as unknown as PrefetchOptions);
  return true;
}
