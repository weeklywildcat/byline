import { publicationMediaPath, type PublicationImageManifest } from "@byline/content";
import { describe, expect, it } from "vitest";
import { buildSocialImageMetadata, getArticleImageCandidates } from "@/lib/seo";
import type { WordPressMedia } from "@/lib/wordpress";

/** Phase 5 prepared files drive a Payload attachment's SEO and social images; Astro never derives crops. */
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
const attachment = (prepared: boolean): WordPressMedia => ({
  id: 5, date: "", slug: "board", type: "attachment", link: "", author: 0, title: { rendered: "" }, caption: { rendered: "" }, alt_text: "The board meets.", media_type: "image", mime_type: "image/webp",
  source_url: manifest.natural[1].publicPath,
  media_details: { width: 2560, height: 1707, sizes: { a: { file: "a", width: 1440, height: 960, source_url: manifest.natural[0].publicPath } } },
  ...(prepared ? { bylinePublication: { manifest } } : {})
});

describe("SEO images from prepared publication media", () => {
  it("uses the prepared 16:9, 4:3 and 1:1 files after the largest natural file", () => {
    expect(getArticleImageCandidates(attachment(true))).toEqual([
      { url: manifest.natural[1].publicPath, width: 2560, height: 1707 },
      { url: manifest.seo["16x9"].publicPath, width: 2560, height: 1440 },
      { url: manifest.seo["4x3"].publicPath, width: 2560, height: 1920 },
      { url: manifest.seo["1x1"].publicPath, width: 2000, height: 2000 }
    ]);
  });

  it("uses the prepared social image for Open Graph", () => {
    const [social] = buildSocialImageMetadata(attachment(true));
    expect(social).toMatchObject({ width: 1200, height: 630 });
    expect(social.url.endsWith(manifest.social.publicPath)).toBe(true);
  });

  it("keeps WordPress attachments on their existing behaviour", () => {
    const candidates = getArticleImageCandidates(attachment(false));
    expect(candidates.some((candidate) => candidate.url === manifest.seo["16x9"].publicPath)).toBe(false);
    expect(buildSocialImageMetadata(attachment(false))[0].url.endsWith(manifest.natural[1].publicPath)).toBe(true);
  });
});
