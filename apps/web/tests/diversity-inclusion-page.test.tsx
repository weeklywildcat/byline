import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { DI_STORIES, RELATED } from "@/views/diversity-inclusion/content";
import { CODE_ROUTED_PAGE_SLUGS } from "@/lib/code-routes";
import { getNavigation } from "@/lib/publication";

vi.mock("@/views/about/data", () => ({
  getAboutData: async () => ({
    story: (slug: string) => ({ title: slug, href: `/2026/01/01/news/${slug}/`, date: "2026-01-01T00:00:00" })
  })
}));

const { default: DiversityInclusionPage, metadata } = await import("@/views/diversity-inclusion/page");

async function render() {
  return new JSDOM(renderToStaticMarkup(await DiversityInclusionPage())).window.document;
}

describe("diversity and inclusion page", () => {
  it("is canonical, routed by code and linked from the footer", () => {
    expect(metadata.alternates?.canonical).toBe("/diversity-inclusion/");
    expect(CODE_ROUTED_PAGE_SLUGS).toContain("diversity-inclusion");
    expect(getNavigation("footer").some((item) => item.url === "/diversity-inclusion/")).toBe(true);
  });

  it("has one h1 and a sensible heading outline", async () => {
    const document = await render();
    const levels = [...document.querySelectorAll("h1, h2, h3")].map((heading) => Number(heading.tagName[1]));

    expect(document.querySelectorAll("h1")).toHaveLength(1);
    levels.slice(1).forEach((level, index) => expect(level - levels[index]).toBeLessThanOrEqual(1));
  });

  it("links the four related pages as whole-card links with icons", async () => {
    const document = await render();
    const cards = [...document.querySelectorAll(".about-explore-grid a")];

    expect(cards.map((card) => card.getAttribute("href"))).toEqual(["/about/", "/join/", "/leadership/", "/contact/"]);
    expect(RELATED).toHaveLength(4);
    expect(document.querySelectorAll(".about-explore-grid svg")).toHaveLength(8);
  });

  it("invites readers to contact the editors, with a way to stay anonymous", async () => {
    const document = await render();
    const feedback = document.querySelector(".di-feedback")!;

    expect(feedback.querySelector("h2")!.textContent).toBe("What are we missing?");
    expect(feedback.querySelector('a[href="/contact/"]')).not.toBeNull();
    expect(feedback.textContent).toContain("keep your name private");
  });

  it("links stories that resolve and gives the photograph alt text and a credit", async () => {
    const document = await render();
    const hrefs = [...document.querySelectorAll("main a")].map((link) => link.getAttribute("href"));

    for (const slug of Object.values(DI_STORIES)) expect(hrefs.some((href) => href?.includes(slug))).toBe(true);
    expect(document.querySelector(".di-photo img")!.getAttribute("alt")!.length).toBeGreaterThan(20);
    expect(document.querySelector(".di-photo")!.textContent).toContain("Photo:");
  });

  it("avoids stock diversity-statement language", async () => {
    const text = (await render()).querySelector("main")!.textContent!.toLowerCase();

    for (const phrase of ["belonging", "celebrate", "tapestry", "empower", "amplif", "voices matter", "melting pot"]) {
      expect(text).not.toContain(phrase);
    }
  });
});
