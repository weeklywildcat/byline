import { describe, expect, it } from "vitest";
import { excludeCmsNoticePages, isCmsNoticePage } from "@/lib/wordpress";

describe("CMS Notice page", () => {
  it("recognizes the editor landing page by its title", () => {
    expect(isCmsNoticePage({ title: { rendered: "CMS Notice" } })).toBe(true);
    expect(isCmsNoticePage({ title: { rendered: " <em>cms&nbsp;notice</em> " } })).toBe(true);
    expect(isCmsNoticePage({ title: { rendered: "CMS Notice Archive" } })).toBe(false);
    expect(isCmsNoticePage({ title: { rendered: "About" } })).toBe(false);
  });

  it("is dropped from the page list that feeds routes and the sitemap", () => {
    const pages = [
      { slug: "about", title: { rendered: "About" } },
      { slug: "78-2", title: { rendered: "CMS Notice" } },
      { slug: "contact", title: { rendered: "Contact" } }
    ];

    expect(excludeCmsNoticePages(pages).map((page) => page.slug)).toEqual(["about", "contact"]);
  });
});
