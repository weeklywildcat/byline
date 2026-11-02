/**
 * Cloudflare Workers static-asset `_headers` rules. Static files bypass the
 * Worker, so this is the only way to set their caching.
 */
export type HeaderRule = { path: string; headers: Record<string, string> };

export const STATIC_HEADER_RULES: HeaderRule[] = [
  // An open live page re-reads its story's JSON every minute. It must always
  // revalidate so a reader sees an update as soon as the rebuild is live.
  { path: "/_byline/live/*", headers: { "Cache-Control": "no-cache" } }
];

export function buildHeadersFile(rules: HeaderRule[] = STATIC_HEADER_RULES) {
  return rules.map((rule) => `${rule.path}\n${Object.entries(rule.headers).map(([name, value]) => `  ${name}: ${value}`).join("\n")}\n`).join("\n");
}
