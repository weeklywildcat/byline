import { describe, expect, it } from "vitest";
import { serializeMetadata } from "@/lib/metadata";
import {
  absoluteUrl,
  buildPageMetadata,
  buildSocialImageMetadata,
  getArticleAuthorProfileUrls,
  getArticleImageCandidates,
  getHomepageTitle,
  getNewsArticleSchema,
  getOrganizationSchema,
  getPostTimestamps,
  getPublisherSchema,
  getWebsiteSchema,
  serializeJsonLd
} from "@/lib/seo";
import { getMeaningfulImageAlt } from "@/lib/image-alt";
import { author, category, media, post } from "@/tests/support/seo-fixtures";

const ORIGIN = "https://weeklywildcat.com";
const tagValues = (metadata: ReturnType<typeof buildPageMetadata>, key: string) =>
  serializeMetadata(metadata).filter((tag) => tag.key === key).map((tag) => tag.content);

describe("absolute social image URLs", () => {
  it("resolves mirrored WordPress media against the public origin", () => {
    const [image] = buildSocialImageMetadata(media());
    expect(image.url).toBe(`${ORIGIN}/_wordpress-media/2026/10/photo.jpg`);
  });

  it("never prepends the origin twice and leaves absolute URLs alone", () => {
    for (const url of ["https://cms.weeklywildcat.com/wp-content/uploads/a.jpg", `${ORIGIN}/_wordpress-media/a.jpg`, "http://example.org/a.jpg"]) {
      expect(buildSocialImageMetadata({ url })[0].url).toBe(url);
      expect(buildSocialImageMetadata(media({ source_url: url }))[0].url).toBe(url);
    }
    expect(absoluteUrl(absoluteUrl("/_wordpress-media/a.jpg"))).toBe(`${ORIGIN}/_wordpress-media/a.jpg`);
    expect(absoluteUrl("//cdn.example.org/a.jpg")).toBe("https://cdn.example.org/a.jpg");
    expect(absoluteUrl("_wordpress-media/a.jpg")).toBe(`${ORIGIN}/_wordpress-media/a.jpg`);
  });

  it("makes author photos and the default share image absolute", () => {
    expect(buildSocialImageMetadata({ url: "/_wordpress-media/2026/10/author.jpg", width: 400, height: 400, alt: "Gibson Bell" })[0]).toEqual({
      url: `${ORIGIN}/_wordpress-media/2026/10/author.jpg`, width: 400, height: 400, alt: "Gibson Bell"
    });
    expect(buildSocialImageMetadata(null)[0].url).toMatch(/^https:\/\/weeklywildcat\.com\/.+\.png$/);
    expect(buildSocialImageMetadata({ url: "  " })[0].url).toMatch(/^https:\/\//);
  });

  it("keeps width, height and alt on both Open Graph and Twitter tags", () => {
    const metadata = buildPageMetadata({
      title: "Story", description: "A story", path: "/2026/10/14/news/story/", type: "article",
      image: media({ alt_text: "Students at the homecoming parade", media_details: { width: 1600, height: 900 } })
    });
    expect(tagValues(metadata, "og:image")).toEqual([`${ORIGIN}/_wordpress-media/2026/10/photo.jpg`]);
    expect(tagValues(metadata, "twitter:image")).toEqual([`${ORIGIN}/_wordpress-media/2026/10/photo.jpg`]);
    expect(tagValues(metadata, "og:image:width")).toEqual(["1600"]);
    expect(tagValues(metadata, "og:image:height")).toEqual(["900"]);
    expect(tagValues(metadata, "og:image:alt")).toEqual(["Students at the homecoming parade"]);
    expect(tagValues(metadata, "twitter:image:alt")).toEqual(["Students at the homecoming parade"]);
    expect(tagValues(metadata, "og:url")).toEqual([`${ORIGIN}/2026/10/14/news/story/`]);
  });
});

describe("image alt text", () => {
  it("prefers explicit alt text", () => {
    expect(getMeaningfulImageAlt(media({ alt_text: "  The band marches downtown ", title: { rendered: "IMG_0042" } }))).toBe("The band marches downtown");
  });

  it("uses a human-readable title only when there is no alt text", () => {
    expect(getMeaningfulImageAlt(media({ title: { rendered: "Homecoming court &#038; family" } }))).toBe("Homecoming court & family");
  });

  it.each(["CTeam-Pelion_20261015_15", "IMG_0042", "DSC01234.jpg", "Thornwell-", "GOP2026Senate", "Screenshot 2026-10-01 at 3.45.12 PM", "photo 3", "weekly-wildcat-football-3", "", "hero-scaled"])(
    "does not turn the filename-like title %j into alt text", (title) => {
      expect(getMeaningfulImageAlt(media({ title: { rendered: title } }))).toBe("");
    }
  );

  it("omits og:image:alt rather than publishing a filename", () => {
    const metadata = buildPageMetadata({ title: "S", description: "d", path: "/x/", image: media({ title: { rendered: "CTeam-Pelion_20261015_15" } }) });
    expect(tagValues(metadata, "og:image:alt")).toEqual([]);
    expect(tagValues(metadata, "og:image")).toHaveLength(1);
  });
});

describe("article timestamps", () => {
  it("emits GMT-derived ISO timestamps for JSON-LD and Open Graph", () => {
    const article = getNewsArticleSchema(post());
    expect(article.datePublished).toBe("2026-10-14T22:15:00.000Z");
    expect(article.dateModified).toBe("2026-10-14T23:00:00.000Z");
    expect(getPostTimestamps(post())).toEqual({ published: "2026-10-14T22:15:00.000Z", modified: "2026-10-14T23:00:00.000Z" });
  });

  it("converts local-only values from the publication timezone", () => {
    expect(getPostTimestamps(post({ date_gmt: "", modified_gmt: "" }))).toEqual({
      published: "2026-10-14T22:15:00.000Z", modified: "2026-10-14T23:00:00.000Z"
    });
  });

  it("omits invalid dates instead of publishing them, and defaults modified to published", () => {
    expect(getPostTimestamps(post({ date: "", date_gmt: "", modified: "", modified_gmt: "" }))).toEqual({ published: undefined, modified: undefined });
    expect(getPostTimestamps(post({ modified: "nope", modified_gmt: "nope" }))).toEqual({ published: "2026-10-14T22:15:00.000Z", modified: "2026-10-14T22:15:00.000Z" });
  });
});

describe("article authors", () => {
  const guestWithoutProfile = { type: "guest", id: 7, name: "Pat O'Neil", slug: "pat-oneil", hasProfilePage: false };
  const guestWithProfile = { type: "guest", id: 8, name: "Sy'Reanna Dukes", slug: "syreanna-dukes" };
  const multiAuthor = post({
    contributors: [{ type: "user", id: 1 }, guestWithProfile, guestWithoutProfile],
    _embedded: { author: [author(1, "Gibson Bell", "gibson")], "wp:term": [[category(2, "News", "news")], []] }
  });

  it("uses canonical profile URLs for article:author and skips one-off guests", () => {
    expect(getArticleAuthorProfileUrls(multiAuthor)).toEqual([`${ORIGIN}/author/gibson/`, `${ORIGIN}/author/syreanna-dukes/`]);
  });

  it("keeps readable names in JSON-LD Person nodes, with profile URLs only where a profile exists", () => {
    const authors = getNewsArticleSchema(multiAuthor).author as Array<{ name: string; url?: string }>;
    expect(authors.map((entry) => entry.name)).toEqual(["Gibson Bell", "Sy'Reanna Dukes", "Pat O'Neil"]);
    expect(authors.map((entry) => entry.url)).toEqual([`${ORIGIN}/author/gibson/`, `${ORIGIN}/author/syreanna-dukes/`, undefined]);
  });
});

describe("publication structured data", () => {
  it("describes the publication as one stable NewsMediaOrganization", () => {
    const organization = getOrganizationSchema();
    expect(organization["@type"]).toBe("NewsMediaOrganization");
    expect(organization["@id"]).toBe(`${ORIGIN}/#organization`);
    expect(organization.name).toBe("Weekly Wildcat");
    expect(organization.url).toBe(`${ORIGIN}/`);
    expect(organization.logo.url).toMatch(/^https:\/\//);
    expect(organization.address).toMatchObject({ "@type": "PostalAddress", addressLocality: "Ninety Six", streetAddress: "640 South Cambridge Street" });
    expect(organization.sameAs).toEqual(expect.arrayContaining([expect.stringMatching(/^https:\/\/www\.instagram\.com\//)]));
    expect(organization.contactPoint?.url).toBe(`${ORIGIN}/contact/`);
    expect(JSON.stringify(organization)).not.toMatch(/@(?!context|type|id)[a-z]+\./i);
  });

  it("points articles and the website at the same organization entity", () => {
    expect(getNewsArticleSchema(post()).publisher["@id"]).toBe(getOrganizationSchema()["@id"]);
    expect(getPublisherSchema()["@type"]).toBe("NewsMediaOrganization");
    const website = getWebsiteSchema();
    expect(website.name).toBe("Weekly Wildcat");
    expect(website["@id"]).toBe(`${ORIGIN}/#website`);
    expect(website.publisher["@id"]).toBe(`${ORIGIN}/#organization`);
  });

  it("titles the homepage for what the publication is while the site name stays put", () => {
    expect(getHomepageTitle()).toBe("Weekly Wildcat | Ninety Six High School Student Newspaper");
    const metadata = buildPageMetadata({ title: getHomepageTitle(), absoluteTitle: true, description: "d", path: "/" });
    expect(metadata.title).toEqual({ absolute: "Weekly Wildcat | Ninety Six High School Student Newspaper" });
    expect(tagValues(metadata, "og:site_name")).toEqual(["Weekly Wildcat"]);
  });
});

describe("NewsArticle image variants", () => {
  it("lists the original plus the largest size in each Google ratio the upload already has", () => {
    const sized = (width: number, height: number) => ({ file: "", width, height, source_url: `/_wordpress-media/${width}x${height}.jpg` });
    const candidates = getArticleImageCandidates(media({
      source_url: "/_wordpress-media/original.jpg",
      media_details: { width: 2560, height: 1440, sizes: { medium: sized(300, 169), large: sized(1024, 576), "1536x1536": sized(1536, 864), thumbnail: sized(150, 150) } }
    }));
    expect(candidates.map((candidate) => candidate.url)).toEqual(["/_wordpress-media/original.jpg"]);

    const fourByThree = getArticleImageCandidates(media({
      source_url: "/_wordpress-media/original.jpg",
      media_details: { width: 2560, height: 1920, sizes: { large: sized(1024, 768), "1536x1536": sized(1536, 1152), thumbnail: sized(150, 150) } }
    }));
    expect(fourByThree.map((candidate) => candidate.url)).toEqual(["/_wordpress-media/original.jpg"]);

    const mixed = getArticleImageCandidates(media({
      source_url: "/_wordpress-media/original.jpg",
      media_details: { width: 2000, height: 1333, sizes: { square: sized(1200, 1200), wide: sized(1600, 900), classic: sized(1200, 900), tiny: sized(100, 100) } }
    }));
    expect(mixed.map((candidate) => candidate.url)).toEqual([
      "/_wordpress-media/original.jpg", "/_wordpress-media/1200x1200.jpg", "/_wordpress-media/1600x900.jpg", "/_wordpress-media/1200x900.jpg"
    ]);
  });

  it("emits absolute URLs and image credit metadata for every variant", () => {
    const article = getNewsArticleSchema(post({
      featured_media: 90,
      _embedded: {
        author: [author(1, "Gibson Bell", "gibson")],
        "wp:featuredmedia": [media({ bylineImage: { creator: "Gibson Bell", creditText: "", copyrightNotice: "© Weekly Wildcat", licenseUrl: "", acquireLicensePage: "" } })],
        "wp:term": [[category(2, "News", "news")], []]
      }
    }));
    const [image] = article.image as Array<Record<string, unknown>>;
    expect(image.contentUrl).toBe(`${ORIGIN}/_wordpress-media/2026/10/photo.jpg`);
    expect(image.creator).toEqual({ "@type": "Person", name: "Gibson Bell" });
    expect(image.license).toBe(`${ORIGIN}/image-license/`);
  });
});

describe("metadata escaping", () => {
  const named = post({
    title: { rendered: "Sy&#8217;Reanna&#039;s &#8220;best&#8221; night &amp; more" },
    excerpt: { rendered: "<p>Arts &amp; Culture meets &quot;theater&quot;.</p>" },
    contributors: [{ type: "user", id: 1 }],
    _embedded: {
      author: [author(1, "Sy'Reanna Dukes", "syreanna")],
      "wp:term": [[category(3, "Arts &amp; Culture", "culture")], [{ id: 9, count: 1, description: "", link: "", name: "Q&amp;A", slug: "qa", taxonomy: "post_tag" }]]
    }
  });

  it("decodes entities once in JSON-LD so nothing is double-escaped", () => {
    const article = getNewsArticleSchema(named);
    expect(article.headline).toBe("Sy’Reanna's “best” night & more");
    expect(article.description).toBe("Arts & Culture meets \"theater\".");
    expect(article.articleSection).toBe("Arts & Culture");
    expect(article.keywords).toBe("Q&A");
    expect((article.author as { name: string }).name).toBe("Sy'Reanna Dukes");
    expect(JSON.stringify(article)).not.toMatch(/&amp;|&#\d+;|&quot;/);
  });

  it("round-trips JSON-LD through the script-safe serializer", () => {
    const parsed = JSON.parse(serializeJsonLd({ name: "</script><b>Sy'Reanna & \"Co\"</b>" }));
    expect(parsed.name).toBe("</script><b>Sy'Reanna & \"Co\"</b>");
    expect(serializeJsonLd({ name: "</script>" })).not.toContain("</script>");
  });

  it("keeps apostrophes, ampersands and quotes as plain text in page metadata", () => {
    const metadata = buildPageMetadata({ title: "Arts & Culture", description: "Sy'Reanna's \"first\" show &amp; more", path: "/category/culture/" });
    expect(tagValues(metadata, "og:title")).toEqual(["Arts & Culture"]);
    expect(tagValues(metadata, "og:description")).toEqual(["Sy'Reanna's \"first\" show & more"]);
  });
});
