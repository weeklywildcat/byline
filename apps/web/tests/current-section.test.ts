import { describe, expect, it } from "vitest";
import { currentLink } from "@/lib/current-section";

describe("currentLink", () => {
  it("marks the section page itself", () => {
    expect(currentLink("/category/news/", "/category/news/")).toBe("page");
    expect(currentLink("/the-prowler/", "/the-prowler")).toBe("page");
  });

  it("marks the section an article or a later archive page belongs to", () => {
    expect(currentLink("/category/news/", "/2026/01/15/news/a-quiet-morning/")).toBe("true");
    expect(currentLink("/the-prowler/", "/2026/04/01/the-prowler/cafeteria-unionizes/")).toBe("true");
    expect(currentLink("/category/news/", "/category/news/page/2/")).toBe("true");
  });

  it("leaves other links and pages alone", () => {
    expect(currentLink("/category/sports/", "/2026/01/15/news/a-quiet-morning/")).toBeUndefined();
    expect(currentLink("/category/news/", "/")).toBeUndefined();
    expect(currentLink("/", "/about/")).toBeUndefined();
    expect(currentLink("https://example.com/", "/about/")).toBeUndefined();
    expect(currentLink("/category/news/", undefined)).toBeUndefined();
  });
});
