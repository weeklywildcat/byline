/**
 * Cloudflare Workers static-asset `_headers` rules. Static files bypass the
 * Worker, so this is the only way to set their caching.
 */
export type HeaderRule = { path: string; headers: Record<string, string> };

export const STATIC_HEADER_RULES: HeaderRule[] = [
  // Static JSON is a permanent archive. Never retain an older deployment
  // in the browser or a downstream CDN. The runtime Worker sets its own headers.
  { path: "/_byline/live/*", headers: { "Cache-Control": "no-store" } }
];

export function buildHeadersFile(rules: HeaderRule[] = STATIC_HEADER_RULES) {
  return rules.map((rule) => `${rule.path}\n${Object.entries(rule.headers).map(([name, value]) => `  ${name}: ${value}`).join("\n")}\n`).join("\n");
}
