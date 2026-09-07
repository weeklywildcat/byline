import robots from "@/views/robots";

export const prerender = true;

export function GET() {
  const value = robots();
  const rules = Array.isArray(value.rules) ? value.rules : [value.rules];
  const body = [
    ...rules.flatMap((rule) => [
      `User-agent: ${rule.userAgent}`,
      ...(Array.isArray(rule.allow) ? rule.allow : [rule.allow]).filter(Boolean).map((path) => `Allow: ${path}`),
      ...(Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]).filter(Boolean).map((path) => `Disallow: ${path}`)
    ]),
    ...(Array.isArray(value.sitemap) ? value.sitemap : [value.sitemap]).filter(Boolean).map((url) => `Sitemap: ${url}`),
    value.host ? `Host: ${value.host}` : ""
  ].filter(Boolean).join("\n") + "\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
