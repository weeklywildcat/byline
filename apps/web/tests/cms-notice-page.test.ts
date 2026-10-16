import { describe, expect, it } from "vitest";
import { getAllPages, isCmsNoticePage } from "@/lib/wordpress";

describe("CMS Notice page", () => {
  it("recognizes the editor landing page by its title", () => {
    expect(isCmsNoticePage({ title: { rendered: "CMS Notice" } })).toBe(true);
    expect(isCmsNoticePage({ title: { rendered: " <em>cms&nbsp;notice</em> " } })).toBe(true);
    expect(isCmsNoticePage({ title: { rendered: "CMS Notice Archive" } })).toBe(false);
    expect(isCmsNoticePage({ title: { rendered: "About" } })).toBe(false);
  });

  it("is kept out of the page list that feeds routes and the sitemap", async () => {
    const pages = await getAllPages();

    expect(pages.some(isCmsNoticePage)).toBe(false);
  });
});
