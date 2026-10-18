import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import DiversityInclusionPage, { metadata } from "@/views/diversity-inclusion/page";
import { RELATED } from "@/views/diversity-inclusion/content";
import { CODE_ROUTED_PAGE_SLUGS } from "@/lib/code-routes";
import { getNavigation } from "@/lib/publication";

async function render() {
  return new JSDOM(renderToStaticMarkup(<DiversityInclusionPage />)).window.document;
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

  it("opens on a fullscreen hero with the statement, then the page content", async () => {
    const document = await render();
    const hero = document.querySelector(".hero-reveal")!;
    const content = document.querySelector(".hero-reveal-content")!;

    expect(hero.querySelector("h1")).not.toBeNull();
    expect(hero.querySelector(".di-hero-statement")!.textContent).toContain("represented accurately, fairly and fully");
    expect(hero.querySelector("img.hero-reveal-image")!.getAttribute("alt")).toBe("");
    expect(hero.querySelector('a.hero-reveal-scroll[href="#di-content"]')).not.toBeNull();
    expect(content.id).toBe("di-content");
    expect(hero.compareDocumentPosition(content) & 4).toBeTruthy();
    expect(content.querySelector("#di-reporting-heading")).not.toBeNull();
    expect(content.querySelector("h1")).toBeNull();
  });

  it("links the four related pages as whole-card links with icons", async () => {
    const document = await render();
    const cards = [...document.querySelectorAll(".about-explore-grid a")];

    expect(cards.map((card) => card.getAttribute("href"))).toEqual(["/about/", "/join/", "/leadership/", "/contact/"]);
    expect(RELATED).toHaveLength(4);
    expect(document.querySelectorAll(".about-explore-grid svg")).toHaveLength(8);
  });

  it("invites readers to contact the editors, with a way to withhold a name", async () => {
    const document = await render();
    const feedback = document.querySelector(".di-feedback")!;

    expect(feedback.querySelector("h2")!.textContent).toBe("Help us do better");
    expect(feedback.querySelector('a[href="/contact/"]')).not.toBeNull();
    expect(feedback.textContent).toContain("without attaching their name");
  });

  it("gives the photograph alt text and a credit", async () => {
    const document = await render();

    expect(document.querySelector(".di-photo img")!.getAttribute("alt")!.length).toBeGreaterThan(20);
    expect(document.querySelector(".di-photo")!.textContent).toContain("Photo:");
  });

  it("avoids stock diversity-statement language", async () => {
    const text = (await render()).querySelector("main")!.textContent!.toLowerCase();

    for (const phrase of ["belonging", "celebrate", "tapestry", "empower", "amplif", "voices matter", "melting pot", "?"]) {
      expect(text).not.toContain(phrase);
    }
  });
});
