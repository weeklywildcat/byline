import { WEEKLY_WILDCAT_PUBLICATION } from "@byline/theme-weekly-wildcat/publication";
import { describe, expect, it } from "vitest";
import { projectPayloadImage } from "../src/preview/payload-story";
import { previewPublicationFrom } from "../src/preview/publication";
import { STORY_PRESENTATIONS } from "../src/domain/vocabulary";

/**
 * Live Preview and the public site draw one opening and one navigation contract:
 * these cover the newsroom's half (the vocabulary the editor offers, the
 * navigation Preview draws, and the art-directed crops Preview cannot show).
 */
describe("Story opening vocabulary", () => {
  it("offers exactly the four openings, the two older values first", () => {
    expect([...STORY_PRESENTATIONS]).toEqual(["standard", "feature", "immersive", "split"]);
  });
});

describe("Live Preview site navigation", () => {
  const { siteNavigation } = previewPublicationFrom(WEEKLY_WILDCAT_PUBLICATION);

  it("lists the configured header sections, never a second list", () => {
    expect(siteNavigation.sections.map((link) => link.label)).toEqual(["News", "Sports", "Opinion", "Features", "The Prowler"]);
  });

  it("points at the public site, because Preview runs on the newsroom's origin", () => {
    const origin = WEEKLY_WILDCAT_PUBLICATION.urls.publicSite.replace(/\/$/, "");
    expect(siteNavigation.homeHref).toBe(`${origin}/`);
    expect(siteNavigation.searchHref).toBe(`${origin}/search/`);
    expect(siteNavigation.logoUrl).toBe(`${origin}${WEEKLY_WILDCAT_PUBLICATION.branding.masthead.url}`);
    for (const link of [...siteNavigation.sections, ...siteNavigation.secondary]) expect(link.url.startsWith(origin)).toBe(true);
  });

  it("offers only the footer's About links as secondary links", () => {
    expect(siteNavigation.secondary.map((link) => link.label)).toContain("About us");
    expect(siteNavigation.secondary.map((link) => link.label)).not.toContain("Privacy Policy");
  });
});

describe("Live Preview art direction for the openings", () => {
  const media = { id: 7, mimeType: "image/jpeg", filename: "band.jpg", url: "/api/media/file/band.jpg", width: 3000, height: 2000, alt: "Band" };
  const lead = { role: "lead" as const, sizes: "100vw", priority: true, searchVisibility: "canonical" as const };

  it("shows the photograph, but never pretends to have prepared phone crops", () => {
    expect(projectPayloadImage({ media }, lead)?.src).toBe("/api/media/file/band.jpg");
    expect(projectPayloadImage({ media }, { ...lead, shape: "portrait", cropOnly: true })).toBeNull();
  });
});
