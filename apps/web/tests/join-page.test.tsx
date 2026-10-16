import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import JoinPage, { metadata } from "@/views/join/page";
import { CONTACT_EMAIL, FAQ } from "@/views/join/content";
import { getNavigation } from "@/lib/publication";

const document = new JSDOM(renderToStaticMarkup(<JoinPage />)).window.document;

describe("join page", () => {
  it("is canonical at /join/ and linked from the footer", () => {
    expect(metadata.alternates?.canonical).toBe("/join/");
    expect(getNavigation("footer").some((item) => item.url === "/join/")).toBe(true);
  });

  it("has one h1 and a sensible heading outline", () => {
    const levels = [...document.querySelectorAll("h1, h2, h3")].map((heading) => Number(heading.tagName[1]));

    expect(document.querySelectorAll("h1")).toHaveLength(1);
    levels.slice(1).forEach((level, index) => expect(level - levels[index]).toBeLessThanOrEqual(1));
  });

  it("renders every FAQ entry as a keyboard-friendly disclosure", () => {
    const entries = [...document.querySelectorAll(".join-faq details")];

    expect(entries).toHaveLength(FAQ.length);
    entries.forEach((entry, index) => expect(entry.querySelector("summary")!.textContent).toBe(FAQ[index].question));
  });

  it("repeats the FAQ answers word for word in FAQPage structured data", () => {
    const schema = JSON.parse(document.getElementById("join-faq-json-ld")!.textContent!);

    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(FAQ.length);
    schema.mainEntity.forEach((entity: { acceptedAnswer: { text: string } }, index: number) =>
      expect(entity.acceptedAnswer.text).toBe(FAQ[index].answer)
    );
  });

  it("links the newsroom email address and the follow-up pages", () => {
    const hrefs = [...document.querySelectorAll("main a")].map((link) => link.getAttribute("href"));

    expect(hrefs).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(hrefs).toEqual(expect.arrayContaining(["/contact/", "/about/", "/leadership/"]));
  });

  it("does not mention service hours", () => {
    expect(document.querySelector("main")!.textContent!.toLowerCase()).not.toContain("service hour");
  });

  it("gives the photograph alt text and a credit", () => {
    const image = document.querySelector(".join-photo img")!;

    expect(image.getAttribute("alt")!.length).toBeGreaterThan(20);
    expect(document.querySelector(".join-photo")!.textContent).toContain("Photo:");
  });
});
