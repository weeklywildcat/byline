// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

type Action = { label: string; href: string };
type Section = {
  heading: string;
  featured: boolean;
  paragraphs?: string[];
  actions?: Action[];
};
type PageFixture = {
  eyebrow: string;
  title: string;
  deck: string;
  sections: Section[];
  actions: Action[];
};

function readText(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const fixtures = JSON.parse(readText("./fixtures/page-parity.json")) as Record<string, PageFixture>;
const seed = JSON.parse(readText("../../../wordpress-plugin/migrations/weekly-wildcat-pages.json")) as {
  pages: Array<{ slug: string; sections?: Array<{ paragraphs?: string[] }> }>;
};
const pageBlocksCss = readText("../../../packages/ui/src/page-blocks.css");

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] || character);
}

function sectionParagraphs(slug: string, section: Section, index: number): string[] {
  if (section.paragraphs?.length) return section.paragraphs;
  const seedPage = seed.pages.find((page) => page.slug === slug);
  return seedPage?.sections?.[index]?.paragraphs || [`${section.heading} reference copy.`];
}

function actionMarkup(actions: Action[], className: string): string {
  if (!actions.length) return "";
  return `<div class="${className}">${actions.map((action) => `<a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`).join("")}</div>`;
}

function renderPreGutenbergPage(slug: string, page: PageFixture): string {
  const sections = page.sections.map((section, index) => {
    const sectionClass = section.featured ? "static-page-section static-page-section-featured" : "static-page-section";
    const paragraphs = sectionParagraphs(slug, section, index).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
    return `<section class="${sectionClass}"><h2>${escapeHtml(section.heading)}</h2><div>${paragraphs}${actionMarkup(section.actions || [], "static-page-section-actions")}</div></section>`;
  }).join("");

  return `<main class="static-page-shell"><article class="static-page"><header class="static-page-header"><p>${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.title)}</h1><p class="static-page-deck">${escapeHtml(page.deck)}</p></header><div class="static-page-content">${sections}${actionMarkup(page.actions, "static-page-actions")}</div></article></main>`;
}

function renderGutenbergPage(slug: string, page: PageFixture): string {
  const sections = page.sections.map((section, index) => {
    const sectionClass = section.featured ? "wp-block-byline-page-section is-style-featured" : "wp-block-byline-page-section";
    const paragraphs = sectionParagraphs(slug, section, index).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
    const buttons = section.actions?.length
      ? `<div class="wp-block-buttons">${section.actions.map((action) => `<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a></div>`).join("")}</div>`
      : "";
    return `<section class="${sectionClass}"><h2 class="wp-block-heading">${escapeHtml(section.heading)}</h2><div class="wp-block-byline-page-section__body">${paragraphs}${buttons}</div></section>`;
  }).join("");
  const pageActions = page.actions.length
    ? `<div class="wp-block-buttons is-style-page-actions">${page.actions.map((action) => `<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a></div>`).join("")}</div>`
    : "";

  return `<main class="static-page-shell"><article class="static-page"><header class="static-page-header"><p>${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.title)}</h1><p class="static-page-deck">${escapeHtml(page.deck)}</p></header><div class="static-page-content byline-page-content">${sections}${pageActions}</div></article></main>`;
}

function summary(document: Document, sectionSelector: string) {
  const article = document.querySelector("article");
  const sections = Array.from(document.querySelectorAll(sectionSelector)).map((section) => {
    const body = section.querySelector(".wp-block-byline-page-section__body") || section.querySelector("div");
    return {
      heading: section.querySelector("h2, h3, h4")?.textContent || "",
      featured: section.classList.contains("is-style-featured") || section.classList.contains("static-page-section-featured"),
      paragraphs: Array.from(body?.querySelectorAll("p") || []).map((paragraph) => paragraph.textContent || ""),
      actions: Array.from(body?.querySelectorAll("a") || []).map((link) => ({ label: link.textContent || "", href: link.getAttribute("href") || "" }))
    };
  });
  const pageActionSelector = sectionSelector.includes("wp-block")
    ? ".wp-block-buttons.is-style-page-actions a"
    : ".static-page-content > .static-page-actions a";
  return {
    eyebrow: article?.querySelector(".static-page-header > p")?.textContent || "",
    title: article?.querySelector("h1")?.textContent || "",
    deck: article?.querySelector(".static-page-deck")?.textContent || "",
    sections,
    actions: Array.from(document.querySelectorAll(pageActionSelector)).map((link) => ({ label: link.textContent || "", href: link.getAttribute("href") || "" }))
  };
}

describe("pre-Gutenberg Page design parity", () => {
  it.each(["diversity-inclusion", "about", "terms"])("preserves the %s semantic page structure", (slug) => {
    const page = fixtures[slug];
    const legacyDom = new JSDOM(renderPreGutenbergPage(slug, page));
    const blockDom = new JSDOM(renderGutenbergPage(slug, page));

    expect(summary(blockDom.window.document, ".wp-block-byline-page-section")).toEqual(summary(legacyDom.window.document, ".static-page-section"));
    expect(blockDom.window.document.querySelectorAll(".wp-block-byline-page-section")).toHaveLength(page.sections.length);
    expect(blockDom.window.document.querySelectorAll(".wp-block-byline-page-section.is-style-featured")).toHaveLength(page.sections.filter((section) => section.featured).length);
  });

  it("keeps About actions as outlined Core Buttons and keeps section CTAs separate", () => {
    const dom = new JSDOM(renderGutenbergPage("about", fixtures.about));
    expect(dom.window.document.querySelector(".wp-block-buttons.is-style-page-actions")).not.toBeNull();
    expect(dom.window.document.querySelector(".wp-block-buttons.is-style-page-actions a")?.textContent).toBe("Meet Our Writers");
    expect(dom.window.document.querySelector(".wp-block-byline-page-section .wp-block-buttons.is-style-page-actions")).toBeNull();
    expect(pageBlocksCss).toContain(".byline-page-content .wp-block-buttons.is-style-page-actions .wp-block-button__link");
    expect(pageBlocksCss).toContain("background: transparent;");
    expect(pageBlocksCss).toContain(".byline-page-content .wp-block-buttons.is-style-page-actions,");
    expect(pageBlocksCss).toContain("padding-top: 20px;");
  });

  it("uses one grid-owned spacing rhythm inside Page Sections at computed style level", () => {
    const dom = new JSDOM(`<!doctype html><html><head><style>${pageBlocksCss}</style></head><body><div class="byline-page-content"><section class="wp-block-byline-page-section"><h2 class="wp-block-heading">Standard</h2><div class="wp-block-byline-page-section__body"><p>One</p><p>Two</p></div></section><section class="wp-block-byline-page-section is-style-featured"><h2 class="wp-block-heading">Featured</h2><div class="wp-block-byline-page-section__body"><p>Copy</p><div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link">Share Feedback</a></div></div></div></section></div></body></html>`);
    const standard = dom.window.document.querySelector(".wp-block-byline-page-section") as HTMLElement;
    const body = dom.window.document.querySelector(".wp-block-byline-page-section__body") as HTMLElement;
    const paragraph = body.querySelector("p") as HTMLElement;
    const featured = dom.window.document.querySelector(".is-style-featured") as HTMLElement;
    expect(dom.window.getComputedStyle(standard).display).toBe("grid");
    expect(dom.window.getComputedStyle(standard).gap).toBe("24px");
    expect(dom.window.getComputedStyle(body).display).toBe("grid");
    expect(dom.window.getComputedStyle(body).gap).toBe("12px");
    expect(dom.window.getComputedStyle(paragraph).marginBottom).toBe("0px");
    expect(dom.window.getComputedStyle(featured).backgroundColor).toBe("rgb(23, 26, 33)");
    expect(pageBlocksCss).not.toContain("!important");
  });
});
