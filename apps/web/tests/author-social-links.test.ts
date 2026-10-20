import { describe, expect, it } from "vitest";

import { getAuthorSocialLinks, type WordPressAuthor } from "@/lib/wordpress";

const author: WordPressAuthor = {
  id: 12,
  name: "Alex Writer",
  slug: "alex-writer",
  bylineProfile: {
    pronouns: "",
    role: "Reporter",
    socials: {
      website: "https://example.com",
      email: "alex@example.com",
      instagram: "https://www.instagram.com/alex",
      tiktok: "",
      linkedin: "",
      x: "https://x.com/alex"
    }
  }
};

describe("public author social links", () => {
  it("includes X and preserves the other published contact links", () => {
    expect(getAuthorSocialLinks(author)).toEqual([
      { label: "Website", href: "https://example.com" },
      { label: "Email", href: "mailto:alex@example.com" },
      { label: "Instagram", href: "https://www.instagram.com/alex" },
      { label: "X", href: "https://x.com/alex" }
    ]);
  });

  it("omits empty social profiles", () => {
    expect(getAuthorSocialLinks({
      ...author,
      bylineProfile: {
        ...author.bylineProfile!,
        socials: { website: "", email: "", instagram: "", tiktok: "", linkedin: "", x: "" }
      }
    })).toEqual([]);
  });
});
