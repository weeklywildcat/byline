import { writeFile } from "node:fs/promises";
const origin = new URL(process.argv[2] || "https://weeklywildcat.com");
const limit = Math.max(1, Number(process.argv[3] || 5000));
const queue = [origin.href];
const seen = new Set();
const records = [];
function attribute(tag, name) { return tag.match(new RegExp(`${name}=(["'])(.*?)\\1`, "i"))?.[2] ?? ""; }
function metas(source, name) {
  return [...source.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((candidate) => attribute(candidate, "(?:name|property)") === name)
    .map((candidate) => attribute(candidate, "content"))
    .filter(Boolean);
}
function meta(source, name) { return metas(source, name)[0] ?? ""; }
while (queue.length && records.length < limit) {
  const url = queue.shift();
  if (!url || seen.has(url)) continue;
  seen.add(url);
  const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Byline migration parity crawler" } });
  const text = (response.headers.get("content-type") || "").includes("text/html") ? await response.text() : "";
  const find = (pattern) => text.match(pattern)?.[1] ?? "";
  const canonicalTag = [...text.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((candidate) => attribute(candidate, "rel") === "canonical");
  records.push({
    url, status: response.status, location: response.headers.get("location"), title: find(/<title>([\s\S]*?)<\/title>/i), canonical: canonicalTag ? attribute(canonicalTag, "href") : "", description: meta(text, "description"),
    openGraphUrl: meta(text, "og:url"), openGraphImage: meta(text, "og:image"), openGraphImageWidths: metas(text, "og:image:width"),
    openGraphImageHeights: metas(text, "og:image:height"), openGraphImageAlts: metas(text, "og:image:alt"), articleSection: meta(text, "article:section"),
    articlePublishedTime: meta(text, "article:published_time"), articleModifiedTime: meta(text, "article:modified_time"), articleAuthors: metas(text, "article:author"),
    articleTags: metas(text, "article:tag"), twitterImageAlts: metas(text, "twitter:image:alt")
  });
  for (const match of text.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try { const next = new URL(match[1], url); next.hash = ""; if (next.origin === origin.origin && !seen.has(next.href)) queue.push(next.href); } catch {}
  }
}
await writeFile(process.argv[4] || "production-crawl.json", `${JSON.stringify(records, null, 2)}\n`);
console.log(`Crawled ${records.length} production URLs.`);
