/**
 * Build-time SEO audit of the generated static HTML. Pure functions over HTML/XML
 * strings so the same rules run against `out/` after a build (verify-seo.mjs)
 * and against fixtures in unit tests. Keep this file free of path aliases and
 * non-erasable TypeScript: Node runs it directly.
 */

export type AuditIssue = { route: string; message: string };

export type ParsedPage = {
  route: string;
  title: string;
  canonicals: string[];
  robots: string;
  metas: Array<{ key: string; content: string }>;
  links: Array<Record<string, string>>;
  jsonLd: Array<{ value: unknown; error?: string }>;
  h1: string[];
  mastheadHasTime: boolean;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decode exactly one level of HTML entities, the way a browser does for an attribute value. */
export function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([^\s=/<>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (name === "meta" || name === "link") continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function textOf(html: string) {
  return decodeEntities(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<img\b[^>]*\balt=("([^"]*)"|'([^']*)')[^>]*>/gi, (_m, _q, a, b) => ` ${a ?? b} `).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parsePage(html: string, route: string): ParsedPage {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? html;
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].flatMap((match) => {
    const attributes = parseAttributes(match[0]);
    const key = attributes.property ?? attributes.name;
    return key && attributes.content !== undefined ? [{ key, content: attributes.content }] : [];
  });
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((match) => parseAttributes(match[0]));
  const jsonLd = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => {
    try {
      return { value: JSON.parse(match[1]) as unknown };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const utility = html.match(/class="site-utility[^"]*"[\s\S]*?(?=masthead-logo)/i)?.[0] ?? "";

  return {
    route,
    title: decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim(),
    canonicals: links.filter((link) => link.rel === "canonical").map((link) => link.href ?? ""),
    robots: metas.find((meta) => meta.key === "robots")?.content ?? "",
    metas,
    links,
    jsonLd,
    h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => textOf(match[1])),
    mastheadHasTime: /<time\b/i.test(utility)
  };
}

const values = (page: ParsedPage, key: string) => page.metas.filter((meta) => meta.key === key).map((meta) => meta.content);
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ENTITY_LEFTOVER = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/i;
const SCALAR_TAGS = [
  "description", "og:title", "og:description", "og:url", "og:type", "og:site_name", "og:locale",
  "twitter:card", "twitter:title", "twitter:description", "article:published_time", "article:modified_time", "article:section"
];

export function isArticleRoute(route: string) {
  return /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/[^/]+\/$/.test(route);
}

function nodesOf(page: ParsedPage) {
  const nodes: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      nodes.push(value as Record<string, unknown>);
      if ("@graph" in value) visit((value as Record<string, unknown>)["@graph"]);
    }
  };
  page.jsonLd.forEach((block) => visit(block.value));
  return nodes;
}

function typesOf(node: Record<string, unknown>) {
  return ([] as unknown[]).concat(node["@type"] ?? []).map(String);
}

function* urlStrings(value: unknown, key = ""): Generator<[string, string]> {
  if (typeof value === "string") {
    if (["url", "@id", "contentUrl", "item", "logo", "image", "acquireLicensePage", "license", "sameAs"].includes(key)) yield [key, value];
  } else if (Array.isArray(value)) {
    for (const entry of value) yield* urlStrings(entry, key);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) yield* urlStrings(child, childKey);
  }
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

export type PageAuditContext = {
  /** Public origin, e.g. https://weeklywildcat.com */
  origin: string;
  siteName: string;
  kind?: string;
};

/** Audit one generated HTML page. Redirect and 404 pages are checked elsewhere. */
export function auditPage(html: string, route: string, { origin, siteName }: PageAuditContext): AuditIssue[] {
  const page = parsePage(html, route);
  const issues: AuditIssue[] = [];
  const fail = (message: string) => issues.push({ route, message });
  const absolute = (value: string) => value.startsWith(`${origin}/`) || value === origin;

  if (!page.title) fail("missing or empty <title>");
  if (!values(page, "description")[0]) fail("missing or empty meta description");

  if (page.canonicals.length !== 1) fail(`expected exactly one canonical link, found ${page.canonicals.length}`);
  const canonical = page.canonicals[0] ?? "";
  if (canonical && !absolute(canonical)) fail(`canonical is not an absolute URL on ${origin}: ${canonical}`);
  if (canonical && canonical !== `${origin}${route}`) fail(`canonical ${canonical} does not match the page URL ${origin}${route}`);

  if (!/^(?:index|noindex),(?:follow|nofollow)$/.test(page.robots)) fail(`unexpected robots meta: "${page.robots}"`);

  for (const key of SCALAR_TAGS) {
    if (values(page, key).length > 1) fail(`duplicate <meta> ${key}: ${values(page, key).join(" | ")}`);
  }
  for (const key of ["og:title", "og:description", "og:url", "og:type", "twitter:card"]) {
    if (!values(page, key)[0]) fail(`missing ${key}`);
  }
  const ogUrl = values(page, "og:url")[0];
  if (ogUrl && !absolute(ogUrl)) fail(`og:url is not absolute: ${ogUrl}`);
  if (ogUrl && canonical && ogUrl !== canonical) fail(`og:url ${ogUrl} disagrees with canonical ${canonical}`);
  if (!["summary", "summary_large_image"].includes(values(page, "twitter:card")[0] ?? "")) fail(`unexpected twitter:card "${values(page, "twitter:card")[0] ?? ""}"`);

  for (const key of ["og:image", "twitter:image"]) {
    for (const image of values(page, key)) {
      if (!/^https?:\/\//i.test(image)) fail(`${key} is not an absolute URL: ${image}`);
    }
  }
  for (const key of ["og:image:width", "og:image:height"]) {
    for (const dimension of values(page, key)) {
      if (!/^[1-9]\d*$/.test(dimension)) fail(`${key} is not a positive integer: ${dimension}`);
    }
  }

  if (!page.links.some((link) => link.rel === "alternate" && link.type === "application/rss+xml" && link.href === `${origin}/feed.xml`)) {
    fail("missing RSS discovery link to /feed.xml");
  }

  for (const [index, block] of page.jsonLd.entries()) {
    if (block.error) fail(`JSON-LD block ${index + 1} does not parse: ${block.error}`);
  }
  const leftovers = [page.title, ...page.metas.map((meta) => meta.content), ...page.jsonLd.flatMap((block) => stringsIn(block.value))]
    .filter((text) => ENTITY_LEFTOVER.test(text));
  for (const text of leftovers) fail(`metadata appears double-escaped: ${text.slice(0, 80)}`);

  const nodes = nodesOf(page);
  for (const node of nodes) {
    for (const [key, url] of urlStrings(node)) {
      if (key === "sameAs" || !/^(?:https?:)?\/\//i.test(url) && !url.startsWith("/")) continue;
      if (!/^https?:\/\//i.test(url)) fail(`structured data ${key} is not absolute: ${url}`);
    }
  }

  if (isArticleRoute(route)) {
    if (values(page, "og:type")[0] !== "article") fail(`og:type should be article, found "${values(page, "og:type")[0] ?? ""}"`);
    for (const key of ["article:published_time", "article:modified_time"]) {
      const value = values(page, key)[0] ?? "";
      if (!ISO_WITH_ZONE.test(value) || Number.isNaN(Date.parse(value))) fail(`${key} is not a timezone-aware ISO timestamp: "${value}"`);
    }
    if (!values(page, "article:section")[0]) fail("missing article:section");
    for (const author of values(page, "article:author")) {
      if (!/^https?:\/\//i.test(author) || !absolute(author) || !author.includes("/author/")) fail(`article:author should be a profile URL on ${origin}: ${author}`);
    }

    const article = nodes.find((node) => typesOf(node).includes("NewsArticle"));
    if (!article) {
      fail("missing NewsArticle JSON-LD");
    } else {
      for (const key of ["datePublished", "dateModified"]) {
        const value = String(article[key] ?? "");
        if (!ISO_WITH_ZONE.test(value) || Number.isNaN(Date.parse(value))) fail(`NewsArticle.${key} is not a timezone-aware ISO timestamp: "${value}"`);
      }
      if (!article.headline) fail("NewsArticle.headline is missing");
      if (!article.author) fail("NewsArticle.author is missing");
      const publisher = article.publisher as Record<string, unknown> | undefined;
      if (publisher?.["@id"] !== `${origin}/#organization`) fail("NewsArticle.publisher does not reference the shared organization entity");
      const main = article.mainEntityOfPage as Record<string, unknown> | undefined;
      if (main?.["@id"] !== canonical) fail(`NewsArticle.mainEntityOfPage ${String(main?.["@id"])} is not the canonical URL`);
      if (article.datePublished && values(page, "article:published_time")[0] && Date.parse(String(article.datePublished)) !== Date.parse(values(page, "article:published_time")[0])) {
        fail("NewsArticle.datePublished disagrees with article:published_time");
      }
    }
    if (!nodes.some((node) => typesOf(node).includes("BreadcrumbList"))) fail("missing BreadcrumbList JSON-LD");
    if (page.mastheadHasTime) fail("the masthead build date <time> is rendered on an article page");
  }

  if (route === "/") {
    if (!page.title.startsWith(siteName) || page.title === siteName) fail(`homepage title should describe the publication, found "${page.title}"`);
    if (page.h1.length !== 1 || !page.h1[0].includes(siteName)) fail(`homepage needs exactly one h1 naming ${siteName}, found ${JSON.stringify(page.h1)}`);
    const organization = nodes.find((node) => typesOf(node).includes("NewsMediaOrganization"));
    if (!organization || organization["@id"] !== `${origin}/#organization`) fail("homepage is missing the NewsMediaOrganization entity");
    const website = nodes.find((node) => typesOf(node).includes("WebSite"));
    if (!website || website.name !== siteName) fail(`homepage WebSite name should be "${siteName}"`);
  }

  return issues;
}

export type SitemapPage = { canonical: string; robots: string; kind?: string };

export function sitemapLocations(xml: string) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => decodeEntities(match[1].trim()));
}

/** Every sitemap URL must be a real, canonical, indexable page — not a redirect, 404, or noindex page. */
export function auditSitemap(xml: string, pages: Map<string, SitemapPage>, origin: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const seen = new Set<string>();

  for (const loc of sitemapLocations(xml)) {
    const fail = (message: string) => issues.push({ route: loc, message: `sitemap: ${message}` });
    if (seen.has(loc)) fail("listed more than once");
    seen.add(loc);
    if (!loc.startsWith(`${origin}/`)) {
      fail(`not on ${origin}`);
      continue;
    }
    const route = loc.slice(origin.length);
    const page = pages.get(route);
    if (!page) fail("no generated page for this URL");
    else if (page.kind === "redirect") fail("is a redirect source");
    else if (page.kind === "not-found") fail("is the 404 page");
    else if (/^noindex/.test(page.robots)) fail("is marked noindex");
    else if (page.canonical !== loc) fail(`canonical is ${page.canonical}`);
  }

  return issues;
}

export const NEWS_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function auditNewsSitemap(xml: string, pages: Map<string, SitemapPage>, origin: string, now: number): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = decodeEntities(block[1].match(/<loc>([\s\S]*?)<\/loc>/)?.[1].trim() ?? "");
    const fail = (message: string) => issues.push({ route: loc || "(news sitemap)", message: `news sitemap: ${message}` });
    const published = block[1].match(/<news:publication_date>([\s\S]*?)<\/news:publication_date>/)?.[1].trim() ?? "";
    const page = pages.get(loc.startsWith(origin) ? loc.slice(origin.length) : "");

    if (!page || !isArticleRoute(loc.slice(origin.length))) fail("is not a generated article page");
    else if (/^noindex/.test(page.robots)) fail("is marked noindex");
    else if (page.canonical !== loc) fail(`canonical is ${page.canonical}`);
    if (!ISO_WITH_ZONE.test(published) || Number.isNaN(Date.parse(published))) {
      fail(`publication_date is not a timezone-aware timestamp: "${published}"`);
    } else {
      const age = now - Date.parse(published);
      if (age > NEWS_WINDOW_MS) fail(`story is older than the two-day window (${published})`);
      if (age < -5 * 60 * 1000) fail(`publication_date is in the future (${published})`);
    }
    for (const required of ["news:name", "news:language", "news:title"]) {
      if (!new RegExp(`<${required}>[^<]+</${required}>`).test(block[1])) fail(`missing ${required}`);
    }
  }

  return issues;
}

export function auditFeed(xml: string, pages: Map<string, SitemapPage>, origin: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (!/<rss\b[^>]*version="2\.0"/.test(xml)) issues.push({ route: "/feed.xml", message: "feed: not an RSS 2.0 document" });

  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const link = decodeEntities(item[1].match(/<link>([\s\S]*?)<\/link>/)?.[1].trim() ?? "");
    const fail = (message: string) => issues.push({ route: link || "/feed.xml", message: `feed: ${message}` });
    const page = pages.get(link.startsWith(origin) ? link.slice(origin.length) : "");
    if (!page) fail("item link is not a generated page");
    else if (/^noindex/.test(page.robots)) fail("item link is marked noindex");
    if (!/<title>[^<]+<\/title>/.test(item[1])) fail("item has no title");
    if (Number.isNaN(Date.parse(item[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1].trim() ?? ""))) fail("item pubDate does not parse");
  }

  return issues;
}
