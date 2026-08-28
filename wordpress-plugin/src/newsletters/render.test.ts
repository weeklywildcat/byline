import { describe, expect, it } from "vitest";

import { createNewsletterSnapshot, renderNewsletterHtml, renderNewsletterPlaintext, sanitizeRichText } from "./render";
import { createBlankNewsletter, type Newsletter, type NewsletterStory } from "./models";

const newsletter: Newsletter = {
  ...createBlankNewsletter(),
  id: 7,
  title: "Friday briefing",
  subject: "The Friday briefing",
  preheader: "Three stories for your weekend.",
  intro: "<p>Welcome <strong>back</strong>.</p><script>alert('bad')</script>",
  outro: "<p>Thanks for reading.</p>",
  leadStoryId: 1,
  additionalStoryIds: [2],
  sectionHeadings: ["More from the newsroom"]
};

const stories: NewsletterStory[] = [
  { id: 1, title: "Lead story", url: "https://example.com/lead", excerpt: "<em>Lead</em> excerpt", imageUrl: "https://example.com/lead.jpg", imageAlt: "Lead image" },
  { id: 2, title: "Second story", url: "/stories/second", excerpt: "Second excerpt" }
];

describe("newsletter renderer", () => {
  it("removes executable content and unsafe attributes while retaining allowed text", () => {
    const sanitized = sanitizeRichText("<p onclick=\"evil()\">Safe <strong>copy</strong></p><script>alert(1)</script><a href=\"javascript:bad()\">link</a>");
    expect(sanitized).toContain("<p>Safe <strong>copy</strong></p>");
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("javascript:");
  });

  it("produces deterministic HTML and plaintext snapshots", () => {
    const branding = { publicationName: "Byline Daily", accentColor: "#3858e9" };
    const first = createNewsletterSnapshot(newsletter, stories, branding);
    const second = createNewsletterSnapshot(newsletter, stories, branding);
    expect(first).toEqual(second);
    expect(first.html).toContain("The Friday briefing");
    expect(first.html).toContain("Lead story");
    expect(first.html).toContain("More from the newsroom");
    expect(first.html).not.toContain("alert");
    expect(first.plaintext).toContain("Lead story");
    expect(first.plaintext).toContain("https://example.com/lead");
    expect(first.plaintext).not.toContain("<strong>");
  });

  it("escapes publication and story content at output boundaries", () => {
    const unsafe: Newsletter = { ...newsletter, subject: "<img src=x onerror=alert(1)>", intro: "<p>hello</p>" };
    const html = renderNewsletterHtml(unsafe, [{ ...stories[0], title: "<b>headline</b>" }], { publicationName: "<Publication>" });
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;b&gt;headline&lt;/b&gt;");
    expect(html).not.toContain("<img src=x onerror");
  });

  it("keeps plaintext free of markup and stable when optional fields are empty", () => {
    const minimal = { ...createBlankNewsletter(), id: 2, subject: "Minimal", leadStoryId: null, additionalStoryIds: [] } as Newsletter;
    expect(renderNewsletterPlaintext(minimal, [], { publicationName: "Publication" })).toBe("Minimal\n\nPublication");
  });
});
