/**
 * Route discovery owns the public route set, so reaching this guard during a
 * static render means the snapshot and the view disagreed. Throwing keeps the
 * build fail-closed instead of silently emitting a misleading page.
 */
export function notFound(): never {
  throw new Error("Static route data disappeared after route discovery.");
}
