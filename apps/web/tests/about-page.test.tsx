import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { EXPLORE, NEWSROOM_PHOTOS, PHOTOS, SHOW_NEWSROOM_TODAY, STORY_SLUGS, TIMELINE } from "@/views/about/content";
import { CODE_ROUTED_PAGE_SLUGS } from "@/lib/code-routes";
import { getNavigation } from "@/lib/publication";

const story = (slug: string) => ({ title: `Story ${slug}`, href: `/2026/01/01/news/${slug}/`, date: "2026-01-01T00:00:00" });

vi.mock("@/views/about/data", () => ({
  getAboutData: async () => ({
    stats: {
      storyCount: 20,
      firstStoryDate: "January 22, 2026",
      contributorCount: 8,
      archive: { games: 3859, sports: 8, earliestSeason: "1915–16", href: "/sports-archive/" }
    },
    editors: [{ name: "Test Editor", role: "Editor-in-chief", href: "/author/test/", photo: null }],
    latestBySection: { news: story("latest-news") },
    story,
    photo: (slug: string, alt: string) => ({
      image: { src: `/${slug}.jpg`, sizes: "100vw", width: 800, height: 600, alt, loading: "lazy", decoding: "async", fetchPriority: "auto" },
      credit: "Test Photographer for Weekly Wildcat",
      caption: "A caption",
      story: story(slug)
    })
  })
}));

const { default: AboutPage, metadata } = await import("@/views/about/page");

async function render() {
  return new JSDOM(renderToStaticMarkup(await AboutPage())).window.document;
}

describe("about page", () => {
  it("is canonical at /about/ and keeps the footer link", () => {
    expect(metadata.alternates?.canonical).toBe("/about/");
    expect(getNavigation("footer").some((item) => item.url === "/about/")).toBe(true);
  });

  it("has one h1 and a sensible heading outline", async () => {
    const document = await render();
    const headings = [...document.querySelectorAll("h1, h2, h3")].map((heading) => Number(heading.tagName[1]));

    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(headings[0]).toBe(1);
    headings.slice(1).forEach((level, index) => expect(level - headings[index]).toBeLessThanOrEqual(1));
  });

  it("points the on-page contents at real sections", async () => {
    const document = await render();
    const targets = [...document.querySelectorAll(".about-contents a")].map((link) => link.getAttribute("href")!.slice(1));

    expect(targets.length).toBeGreaterThan(5);
    for (const id of targets) expect(document.getElementById(id), id).not.toBeNull();
  });

  it("links the six institutional cards to their actual routes", async () => {
    const document = await render();
    const cards = [...document.querySelectorAll(".about-explore-grid a")].map((link) => link.getAttribute("href"));

    expect(cards).toEqual([
      "/diversity-inclusion/",
      "/media-kit/",
      "/leadership/",
      "/join/",
      "/advertise/",
      "/contact/"
    ]);
    expect(EXPLORE).toHaveLength(6);
    expect(document.querySelectorAll(".about-explore-grid svg")).toHaveLength(12);
  });

  it("gives every photograph alt text and a credit", async () => {
    const document = await render();
    const images = [...document.querySelectorAll(".about-photo img")];

    expect(images).toHaveLength(Object.keys(PHOTOS).length + NEWSROOM_PHOTOS.length);
    for (const image of images) expect(image.getAttribute("alt")?.length).toBeGreaterThan(20);
    for (const figure of document.querySelectorAll(".about-photo")) expect(figure.textContent).toContain("Photo:");
  });

  it("computes figures from data instead of hardcoding them", async () => {
    if (!SHOW_NEWSROOM_TODAY) {
      expect((await render()).querySelector(".about-stats")).toBeNull();
      return;
    }

    const document = await render();
    const stats = document.querySelector(".about-stats")!.textContent!;

    expect(stats).toContain("20");
    expect(stats).toContain("January 22, 2026");
    expect(stats).toContain("3,859");
    expect(stats).toContain("1915–16");
  });

  it("links only to stories that resolve and to existing site routes", async () => {
    const document = await render();
    const internal = [...document.querySelectorAll("main a")]
      .map((link) => link.getAttribute("href")!)
      .filter((href) => href.startsWith("/"));

    for (const href of internal) {
      expect(href, href).toMatch(
        /^\/(author|authors|category|contact|corrections|diversity-inclusion|image-license|join|advertise|leadership|media-kit|open-source|sports-archive)\/|^\/\d{4}\//
      );
    }
    expect(Object.values(STORY_SLUGS).length).toBeGreaterThan(0);
    expect(TIMELINE.length).toBeGreaterThan(2);
  });

  it("avoids stock newsroom-marketing phrases", async () => {
    const text = (await render()).querySelector("main")!.textContent!.toLowerCase();

    for (const phrase of [
      "more than just a newspaper",
      "empower",
      "amplify",
      "at the heart of",
      "committed to excellence",
      "tapestry",
      "storytelling"
    ]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("is rendered by code, so the CMS page of the same slug is not also generated", () => {
    const route = readFileSync(new URL("../src/pages/[segment].astro", import.meta.url), "utf8");
    const about = readFileSync(new URL("../src/pages/about.astro", import.meta.url), "utf8");

    expect(CODE_ROUTED_PAGE_SLUGS).toEqual(expect.arrayContaining(["about", "join"]));
    expect(route).toContain("CODE_ROUTED_PAGE_SLUGS");
    expect(about).toContain("@/views/about/page");
  });
});
