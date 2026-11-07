const LITERAL_PATH = /^\/(?:[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9][a-z0-9._~-]*)*\/?)?$/i;
const FILE_SUFFIX = /\.[a-z0-9]+$/i;

/** Canonical paths for persisted rules, with slash variants only for directories. */
export function normalizeRedirectPath(value: string): string {
  if (typeof value !== "string" || !LITERAL_PATH.test(value)) {
    throw new Error("Enter a literal site path such as /about/ (without a domain, query, or fragment).");
  }
  if (value === "/") return value;
  const bare = value.replace(/\/$/, "");
  return FILE_SUFFIX.test(bare) ? bare : `${bare}/`;
}

export function isCanonicalRedirectPath(value: string): boolean {
  return LITERAL_PATH.test(value) && normalizeRedirectPath(value) === value;
}

export function redirectSourceVariants(path: string): string[] {
  return path !== "/" && path.endsWith("/") ? [path, path.slice(0, -1)] : [path];
}
