import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PeopleAvatars } from "../src/admin-ui/components/people-avatars";

const people = (count: number) => Array.from({ length: count }, (_, index) => ({ name: ["Caroline Elrod", "Gibson Bell", "Maycie Photographer", "Dana Reyes", "Sam Ortiz", "Lee Park", "Pat Quinn"][index]!, imageUrl: `https://example.test/photo-${index}.jpg` }));
const render = (count: number, props: Record<string, unknown> = {}) => renderToStaticMarkup(<PeopleAvatars people={people(count)} tooltips={false} {...props} />);
const avatars = (html: string) => (html.match(/data-slot="avatar"/g) || []).length;

describe("PeopleAvatars without photos", () => {
  it("never draws a placeholder: nobody without a picture becomes initials in a circle", () => {
    expect(renderToStaticMarkup(<PeopleAvatars people={[{ name: "Caroline Elrod" }, { name: "Gibson Bell", imageUrl: null, avatarUrl: "" }]} />)).toBe("");
  });

  it("shows only the people who have a picture", () => {
    const html = renderToStaticMarkup(<PeopleAvatars people={[{ name: "Caroline Elrod" }, { name: "Gibson Bell", avatarUrl: "https://example.test/gibson.jpg" }]} tooltips={false} />);
    expect(avatars(html)).toBe(1);
    expect(html).toContain('aria-label="Gibson Bell"');
    expect(html).not.toContain("Caroline");
  });
});

describe("PeopleAvatars", () => {
  it("shows no fake avatar for nobody", () => {
    expect(render(0)).toBe("");
  });

  it("shows one person as a single named Avatar, not a group", () => {
    const html = render(1);
    expect(avatars(html)).toBe(1);
    expect(html).not.toContain("avatar-group");
    expect(html).toContain('aria-label="Caroline Elrod"');
    expect(html).not.toContain(">CE<");
  });

  it("groups two and three people with every one of them shown", () => {
    for (const count of [2, 3]) {
      const html = render(count);
      expect(html).toContain('data-slot="avatar-group"');
      expect(avatars(html)).toBe(count);
      expect(html).not.toContain("avatar-group-count");
    }
  });

  it("shows the first three and an AvatarGroupCount with +N for four or more", () => {
    const four = render(4);
    expect(avatars(four)).toBe(3);
    expect(four).toContain('data-slot="avatar-group-count"');
    expect(four).toContain("+1");
    const seven = render(7);
    expect(avatars(seven)).toBe(3);
    expect(seven).toContain("+4");
    expect(seven).toContain("and 4 more: Dana Reyes, Sam Ortiz, Lee Park, Pat Quinn");
    // The whole group is still named for assistive tech, including who is not pictured.
    expect(seven).toContain('aria-label="Caroline Elrod, Gibson Bell, Maycie Photographer, Dana Reyes, Sam Ortiz, Lee Park, Pat Quinn"');
  });

  it("keeps the avatar ring and overlap slots when it adds tooltips", () => {
    const html = renderToStaticMarkup(<PeopleAvatars people={people(5)} />);
    expect(avatars(html)).toBe(3);
    expect(html).toContain('data-slot="avatar-group-count"');
  });
});
