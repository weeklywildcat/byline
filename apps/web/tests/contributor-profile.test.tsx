import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContributorBiography,
  ContributorDirectoryCard,
  ContributorProfileHeader,
  type ContributorPresentation,
} from "@byline/ui/contributor-profile";
const person: ContributorPresentation = {
  name: "Alex Writer",
  role: "Photographer",
  pronouns: "they/them",
  shortBio: "Student photojournalist.",
  socialLinks: [
    { label: "Email", href: "mailto:public@example.test" },
    { label: "Custom", href: "https://example.test/me" },
  ],
};
describe("shared public contributor presentation", () => {
  it("preserves directory markup, name fallback and story counts", () => {
    const html = renderToStaticMarkup(
      <ContributorDirectoryCard
        person={person}
        href="/author/alex/"
        storyCount={1}
      />,
    );
    expect(html).toContain('class="author-card"');
    expect(html).toContain('href="/author/alex/"');
    expect(html).toContain("author-avatar-fallback");
    expect(html).toContain('aria-hidden="true">A');
    expect(html).toContain("1 story");
  });
  it("supports a directory identity without inventing a profile link", () => {
    const html = renderToStaticMarkup(
      <ContributorDirectoryCard person={person} />,
    );
    expect(html).not.toContain("<a ");
    expect(html).toContain("Alex Writer");
  });
  it("shares author header, pronouns, short bio, portrait and ordered social links", () => {
    const html = renderToStaticMarkup(
      <ContributorProfileHeader
        person={{
          ...person,
          photo: {
            url: "/portrait.jpg",
            alt: "Portrait",
            width: 800,
            height: 800,
          },
        }}
      />,
    );
    expect(html).toContain('class="author-profile"');
    expect(html).toContain('alt="Portrait"');
    expect(html).toContain("author-pronouns");
    expect(html).toContain("Student photojournalist.");
    expect(html.indexOf("mailto:")).toBeLessThan(
      html.indexOf("https://example.test/me"),
    );
  });
  it("escapes profile copy, refuses active protocols, and keeps full bio line breaks", () => {
    const html = renderToStaticMarkup(
      <>
        <ContributorProfileHeader
          person={{
            ...person,
            name: "<script>bad</script>",
            socialLinks: [{ label: "Bad", href: "javascript:alert(1)" }],
          }}
        />
        <ContributorBiography bio={"First paragraph.\nSecond paragraph."} />
      </>,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("First paragraph.\nSecond paragraph.");
  });
});
