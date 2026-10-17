import { describe, expect, it } from "vitest";
import { auditFeed, auditNewsSitemap, auditPage, auditSitemap, decodeEntities, type SitemapPage } from "@/scripts/seo-audit.mts";

const origin = "https://weeklywildcat.com";
const context = { origin, siteName: "Weekly Wildcat" };
const route = "/2026/10/14/news/homecoming-week/";
const url = `${origin}${route}`;

function head(overrides: { remove?: string[]; extra?: string; title?: string } = {}) {
  const tags: Record<string, string> = {
    description: `<meta name="description" content="A story">`,
    robots: `<meta name="robots" content="index,follow">`,
    ogtitle: `<meta property="og:title" content="Homecoming week">`,
    ogdesc: `<meta property="og:description" content="A story">`,
    ogurl: `<meta property="og:url" content="${url}">`,
    ogtype: `<meta property="og:type" content="article">`,
    twitter: `<meta name="twitter:card" content="summary_large_image">`,
    published: `<meta property="article:published_time" content="2026-10-14T22:15:00.000Z">`,
    modified: `<meta property="article:modified_time" content="2026-10-14T23:00:00.000Z">`,
    section: `<meta property="article:section" content="News">`,
    author: `<meta property="article:author" content="${origin}/author/gibson/">`,
    ogimage: `<meta property="og:image" content="${origin}/_wordpress-media/a.jpg"><meta property="og:image:width" content="1200"><meta name="twitter:image" content="${origin}/_wordpress-media/a.jpg">`,
    canonical: `<link rel="canonical" href="${url}">`,
    rss: `<link rel="alternate" type="application/rss+xml" title="Weekly Wildcat" href="${origin}/feed.xml">`
  };
  for (const key of overrides.remove ?? []) delete tags[key];
  return `<head><title>${overrides.title ?? "Homecoming week | Weekly Wildcat"}</title>${Object.values(tags).join("")}${overrides.extra ?? ""}</head>`;
}

const articleJson = {
  "@context": "https://schema.org", "@type": "NewsArticle", headline: "Homecoming week",
  mainEntityOfPage: { "@type": "WebPage", "@id": url }, datePublished: "2026-10-14T22:15:00.000Z", dateModified: "2026-10-14T23:00:00.000Z",
  author: { "@type": "Person", name: "Gibson Bell" }, publisher: { "@type": "NewsMediaOrganization", "@id": `${origin}/#organization`, name: "Weekly Wildcat" },
  image: [{ "@type": "ImageObject", url: `${origin}/_wordpress-media/a.jpg` }]
};
const breadcrumbJson = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, item: { "@id": `${origin}/` } }] };
const ld = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const articlePage = (headOverrides = {}, body = `${ld(articleJson)}${ld(breadcrumbJson)}`) =>
  `<html>${head(headOverrides)}<body><header class="site-header"><div class="site-utility site-utility--undated"><span>Ninety Six</span></div><a class="masthead-logo"></a></header>${body}</body></html>`;
const messages = (html: string, path = route) => auditPage(html, path, context).map((issue) => issue.message);

describe("page audit", () => {
  it("accepts a correct article page", () => {
    expect(messages(articlePage())).toEqual([]);
  });

  it("flags relative or non-absolute social and canonical URLs", () => {
    const relative = articlePage({ remove: ["ogimage"], extra: `<meta property="og:image" content="/_wordpress-media/a.jpg"><meta name="twitter:image" content="/_wordpress-media/a.jpg">` });
    expect(messages(relative)).toEqual(expect.arrayContaining([expect.stringContaining("og:image is not an absolute URL"), expect.stringContaining("twitter:image is not an absolute URL")]));
    expect(messages(articlePage({ remove: ["canonical"], extra: `<link rel="canonical" href="/2026/10/14/news/homecoming-week/">` }))).toEqual(expect.arrayContaining([expect.stringContaining("canonical is not an absolute URL")]));
  });

  it("flags duplicate canonicals, duplicate scalar OG tags, and a canonical/og:url mismatch", () => {
    expect(messages(articlePage({ extra: `<link rel="canonical" href="${url}">` }))).toEqual(expect.arrayContaining([expect.stringContaining("exactly one canonical")]));
    expect(messages(articlePage({ extra: `<meta property="og:title" content="Other">` }))).toEqual(expect.arrayContaining([expect.stringContaining("duplicate <meta> og:title")]));
    expect(messages(articlePage({ remove: ["ogurl"], extra: `<meta property="og:url" content="${origin}/elsewhere/">` }))).toEqual(expect.arrayContaining([expect.stringContaining("disagrees with canonical")]));
  });

  it("flags missing basics", () => {
    const found = messages(articlePage({ title: "", remove: ["description", "ogtitle", "ogdesc", "twitter", "rss"] }));
    expect(found).toEqual(expect.arrayContaining([
      "missing or empty <title>", "missing or empty meta description", "missing og:title", "missing og:description",
      expect.stringContaining("twitter:card"), "missing RSS discovery link to /feed.xml"
    ]));
  });

  it("flags non-timezone-aware or missing article dates and a wrong og:type", () => {
    const naive = articlePage({ remove: ["published"], extra: `<meta property="article:published_time" content="2026-10-14T18:15:00">` });
    expect(messages(naive)).toEqual(expect.arrayContaining([expect.stringContaining("article:published_time is not a timezone-aware")]));
    const wrongJson = articlePage({}, `${ld({ ...articleJson, dateModified: "2026-10-14T19:00:00" })}${ld(breadcrumbJson)}`);
    expect(messages(wrongJson)).toEqual(expect.arrayContaining([expect.stringContaining("NewsArticle.dateModified")]));
    expect(messages(articlePage({ remove: ["ogtype"], extra: `<meta property="og:type" content="website">` }))).toEqual(expect.arrayContaining([expect.stringContaining("og:type should be article")]));
  });

  it("flags non-profile article:author values (names, or URLs that are not author pages)", () => {
    expect(messages(articlePage({ remove: ["author"], extra: `<meta property="article:author" content="Gibson Bell">` }))).toEqual(expect.arrayContaining([expect.stringContaining("article:author should be a profile URL")]));
  });

  it("requires NewsArticle and breadcrumb JSON-LD with the shared publisher and canonical entity", () => {
    expect(messages(articlePage({}, ""))).toEqual(expect.arrayContaining(["missing NewsArticle JSON-LD", "missing BreadcrumbList JSON-LD"]));
    const anonymous = articlePage({}, `${ld({ ...articleJson, publisher: { "@type": "Organization", name: "Weekly Wildcat" } })}${ld(breadcrumbJson)}`);
    expect(messages(anonymous)).toEqual(expect.arrayContaining([expect.stringContaining("shared organization entity")]));
    const relativeImage = articlePage({}, `${ld({ ...articleJson, image: [{ url: "/_wordpress-media/a.jpg" }] })}${ld(breadcrumbJson)}`);
    expect(messages(relativeImage)).toEqual(expect.arrayContaining([expect.stringContaining("structured data url is not absolute")]));
  });

  it("flags invalid JSON-LD and double-escaped metadata", () => {
    expect(messages(articlePage({}, `<script type="application/ld+json">{nope</script>${ld(articleJson)}${ld(breadcrumbJson)}`))).toEqual(expect.arrayContaining([expect.stringContaining("does not parse")]));
    expect(messages(articlePage({ title: "Arts &amp;amp; Culture | Weekly Wildcat" }))).toEqual(expect.arrayContaining([expect.stringContaining("double-escaped")]));
    expect(messages(articlePage({ title: "Sy&#39;Reanna &amp; Co | Weekly Wildcat" }))).toEqual([]);
  });

  it("flags the masthead build date on article pages", () => {
    const withDate = articlePage().replace('<span>Ninety Six</span>', '<span>Ninety Six</span><time datetime="2026-10-17">Saturday</time>');
    expect(messages(withDate)).toEqual(expect.arrayContaining([expect.stringContaining("masthead build date")]));
  });

  it("checks the homepage title, h1 and entities", () => {
    const homeHead = (title: string) => head({ title, remove: ["ogtype", "canonical", "ogurl", "published", "modified", "section", "author"], extra: `<meta property="og:type" content="website"><link rel="canonical" href="${origin}/"><meta property="og:url" content="${origin}/">` });
    const org = { "@type": "NewsMediaOrganization", "@id": `${origin}/#organization`, name: "Weekly Wildcat" };
    const site = { "@type": "WebSite", name: "Weekly Wildcat" };
    const good = `<html>${homeHead("Weekly Wildcat, Ninety Six High School's Official Student Newspaper")}<body><h1 class="masthead-logo"><a href="/"><img alt="Weekly Wildcat"></a></h1>${ld(org)}${ld(site)}</body></html>`;
    expect(messages(good, "/")).toEqual([]);
    const bare = good.replace("Weekly Wildcat, Ninety Six High School's Official Student Newspaper", "Weekly Wildcat");
    expect(messages(bare, "/")).toEqual(expect.arrayContaining([expect.stringContaining("homepage title should describe")]));
    expect(messages(good.replace(/<h1[\s\S]*<\/h1>/, ""), "/")).toEqual(expect.arrayContaining([expect.stringContaining("exactly one h1")]));
    expect(messages(good.replace(ld(org), ""), "/")).toEqual(expect.arrayContaining([expect.stringContaining("NewsMediaOrganization")]));
  });

  it("decodes one level of entities", () => {
    expect(decodeEntities("Sy&#39;Reanna &amp; &quot;Co&quot; &#x27;")).toBe("Sy'Reanna & \"Co\" '");
    expect(decodeEntities("&amp;amp;")).toBe("&amp;");
  });
});

describe("sitemap audits", () => {
  const pages = new Map<string, SitemapPage>([
    ["/", { canonical: `${origin}/`, robots: "index,follow" }],
    [route, { canonical: url, robots: "index,follow" }],
    ["/hidden/", { canonical: `${origin}/hidden/`, robots: "noindex,follow" }],
    ["/sports/", { canonical: "/sports-archive/", robots: "noindex", kind: "redirect" }],
    ["/search/", { canonical: `${origin}/search/`, robots: "noindex,follow" }]
  ]);
  const sitemap = (...paths: string[]) => `<urlset>${paths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;

  it("accepts only canonical indexable pages", () => {
    expect(auditSitemap(sitemap("/", route), pages, origin)).toEqual([]);
  });

  it("rejects noindex pages, redirect sources, missing pages, off-site URLs and duplicates", () => {
    const found = auditSitemap(`${sitemap("/hidden/", "/sports/", "/search/", "/missing/", route, route)}<loc>https://example.org/x/</loc>`, pages, origin).map((issue) => issue.message);
    expect(found).toEqual(expect.arrayContaining([
      "sitemap: is marked noindex", "sitemap: is a redirect source", "sitemap: no generated page for this URL", "sitemap: listed more than once", `sitemap: not on ${origin}`
    ]));
  });

  const newsEntry = (publication: string, loc = url) => `<urlset><url><loc>${loc}</loc><news:news><news:publication><news:name>Weekly Wildcat</news:name><news:language>en</news:language></news:publication><news:publication_date>${publication}</news:publication_date><news:title>T</news:title></news:news></url></urlset>`;
  const now = Date.parse("2026-10-15T12:00:00Z");

  it("holds the news sitemap to the two-day window and real timestamps", () => {
    expect(auditNewsSitemap(newsEntry("2026-10-14T22:15:00.000Z"), pages, origin, now)).toEqual([]);
    expect(auditNewsSitemap(newsEntry("2026-10-12T22:15:00.000Z"), pages, origin, now).map((i) => i.message)).toEqual([expect.stringContaining("older than the two-day window")]);
    expect(auditNewsSitemap(newsEntry("2026-10-14T18:15:00"), pages, origin, now).map((i) => i.message)).toEqual([expect.stringContaining("timezone-aware")]);
    expect(auditNewsSitemap(newsEntry("2026-10-14T22:15:00.000Z", `${origin}/hidden/`), pages, origin, now).map((i) => i.message)).toEqual([expect.stringContaining("not a generated article page")]);
  });

  it("audits feed items against generated pages", () => {
    const feed = (link: string) => `<rss version="2.0"><channel><item><title>T</title><link>${link}</link><pubDate>Wed, 14 Oct 2026 22:15:00 GMT</pubDate></item></channel></rss>`;
    expect(auditFeed(feed(url), pages, origin)).toEqual([]);
    expect(auditFeed(feed(`${origin}/hidden/`), pages, origin).map((i) => i.message)).toEqual(["feed: item link is marked noindex"]);
    expect(auditFeed(feed(`${origin}/nope/`), pages, origin).map((i) => i.message)).toEqual(["feed: item link is not a generated page"]);
  });
});
