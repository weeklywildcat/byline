import { publicationMediaPath, type PublicationImageManifest, type PublicStorySnapshot } from "@byline/content";
import { describe, expect, it, vi } from "vitest";
import { nativeArticleJsonLd, nativeArticleMetadata } from "@/lib/native-article-seo";

/** Phase 5 prepared files drive a native Story's SEO and social images; Astro never derives crops. */
const file = (label: string, width: number, height: number, mimeType: "image/webp" | "image/jpeg" = "image/webp") => {
  const sha256 = createSha(label);
  return { sha256, bytes: 1000, mimeType, width, height, publicPath: publicationMediaPath({ kind: "image", filename: "board.jpg", label, sha256, mimeType }) };
};
function createSha(seed: string) {
  return [...seed.padEnd(64, "0")].map((character) => (character.charCodeAt(0) % 16).toString(16)).join("").slice(0, 64);
}
const manifest: PublicationImageManifest = {
  schemaVersion: 1,
  recipeVersion: 1,
  kind: "image",
  source: { width: 3000, height: 2000, animated: false, hasAlpha: false },
  focalPoint: { x: 50, y: 50 },
  natural: [file("natural-1440", 1440, 960), file("natural-2560", 2560, 1707)],
  crops: {},
  seo: { "16x9": { ...file("seo-16x9", 2560, 1440), origin: "auto" }, "4x3": { ...file("seo-4x3", 2560, 1920), origin: "auto" }, "1x1": { ...file("seo-1x1", 2000, 2000), origin: "auto" } },
  social: { ...file("social", 1200, 630, "image/jpeg"), origin: "auto" },
  animation: null,
  warnings: []
};
vi.mock("@/lib/native-snapshot", () => ({
  nativeMedia: (id: number) => id === 5 ? { id, kind: "image", filename: "board.jpg", alt: "The board meets.", license: "/image-license/", manifest } : undefined
}));

const section = { key: "section-1", name: "Arts &amp; Culture", href: "/category/culture/" };
const story: PublicStorySnapshot = {
  id: 1, slug: "board", title: "Board &amp; arts", titleHtml: "Board &amp; arts", excerptHtml: "", href: "/2026/10/14/culture/board/",
  url: "https://weeklywildcat.com/2026/10/14/culture/board/", publishedAt: "2026-10-14T14:05:00.000Z", modifiedAt: "2026-10-14T14:05:00.000Z",
  body: { format: "byline-v1", version: 1, nodes: [{ type: "paragraph", children: [{ type: "text", text: "The board voted." }] }], media: {} },
  image: 5, leadCaption: "A public meeting.", section, sections: [section], sectionKeys: [section.key], topics: [], topicKeys: [],
  contributors: [], contributorKeys: [], athleteMeta: [], corrections: [], reportingNote: [], live: null,
  format: "standard", presentation: "standard", immersiveAlignment: "bottom-left", primaryVideo: null, videoMetadata: null, video: null, listed: true
};

describe("SEO images from native prepared publication media", () => {
  it("uses the prepared 16:9, 4:3 and 1:1 files after the largest natural file", () => {
    const schema = nativeArticleJsonLd(story, true);
    expect(schema).toMatchObject({
      articleBody: "The board voted.",
      image: [manifest.natural[1], manifest.seo["16x9"], manifest.seo["4x3"], manifest.seo["1x1"]].map((file) => ({
        url: `https://weeklywildcat.com${file.publicPath}`, width: file.width, height: file.height, caption: "A public meeting."
      }))
    });
  });

  it("uses the prepared social image for Open Graph", () => {
    expect(nativeArticleMetadata(story).openGraph.images).toEqual([
      expect.objectContaining({ url: `https://weeklywildcat.com${manifest.social.publicPath}`, width: 1200, height: 630 })
    ]);
  });

  it("decodes imported entities and makes native image licenses absolute", () => {
    const metadata = nativeArticleMetadata(story);
    expect(metadata.openGraph.title).toBe("Board & arts");
    expect(metadata.openGraph.section).toBe("Arts & Culture");

    const schema = nativeArticleJsonLd(story, true) as {
      headline: string;
      articleSection: string;
      image: Array<{ license?: string }>;
    };
    expect(schema.headline).toBe("Board & arts");
    expect(schema.articleSection).toBe("Arts & Culture");
    expect(schema.image[0]?.license).toBe("https://weeklywildcat.com/image-license/");
    expect(JSON.stringify(schema)).not.toContain("&amp;");
  });
});
