// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildReviewBlocks, type SubmittedStory } from "../src/domain/review-blocks";
import { compareVersions } from "../src/domain/review-diff";
import type { SubmittedMedia } from "../src/newsroom/review";
import { SubmittedArticle } from "../src/ui/review/SubmittedArticle";

const file = (id: number, patch: Partial<SubmittedMedia> = {}): SubmittedMedia => ({ id, filename: `photo-${id}.jpg`, kind: "image", mimeType: "image/jpeg", width: 1200, height: 800, alt: `Alt ${id}`, credit: "Jane Doe", previewUrl: `/media/${id}-preview.jpg`, url: `/media/${id}.jpg`, state: "unchanged", ...patch });
const p = (text: string) => ({ type: "paragraph", children: [{ type: "text", text }] });
const photo = (media: number, caption = "", altOverride = "") => ({ type: "block", fields: { blockType: "photo", media, caption, altOverride } });
const gallery = (...ids: number[]) => ({ type: "block", fields: { blockType: "gallery", items: ids.map((media) => ({ media, caption: `Cap ${media}`, altOverride: "" })) } });
const story = (children: unknown[], extra: Partial<SubmittedStory> = {}): SubmittedStory => ({ headline: "Greenwood lunch line", body: { root: { type: "root", children } as never }, ...extra });
const render = (value: SubmittedStory, media: SubmittedMedia[], props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<SubmittedArticle blocks={buildReviewBlocks(value)} marks={new Map()} onMark={() => {}} media={new Map(media.map((entry) => [entry.id, entry]))} {...props} />);

describe("submitted media", () => {
  it("shows the lead image, a photo and a gallery as the files this version names, with captions, credit and alt text", () => {
    const html = render(story([photo(7, "Students wait.", "A long line"), gallery(3, 4)], { featuredMedia: 9, featuredCaption: "Lunch" }), [file(9), file(7), file(3), file(4)]);
    expect(html).toContain('src="/media/9-preview.jpg"');
    expect(html).toContain('src="/media/7-preview.jpg"');
    expect(html).toContain('alt="A long line"');
    expect(html).toContain('src="/media/3-preview.jpg"');
    expect(html).toContain('src="/media/4-preview.jpg"');
    expect(html).toContain("Students wait.");
    expect(html).toContain("Credit: Jane Doe");
    expect(html).toContain("Alt text: A long line");
    expect(html).not.toContain("data-media-changed");
  });

  it("says plainly when a file was edited after submission, and when it was deleted, instead of silently showing a replacement", () => {
    const html = render(story([photo(7, "Cap"), photo(8, "Cap")]), [file(7, { state: "changed" }), file(8, { state: "missing" })]);
    expect(html).toContain("data-media-changed");
    expect(html).toContain("edited after it was submitted");
    expect(html).toContain("file was deleted after submission");
  });

  it("keeps each gallery picture's own caption, credit and alt text beside it, and flags only the picture that changed", () => {
    const html = render(story([gallery(3, 4, 5)]), [file(3, { credit: "A. Ng", alt: "Alt three" }), file(4, { credit: "B. Cho", state: "changed" }), file(5, { credit: "C. Diaz" })]);
    const dom = new DOMParser().parseFromString(html, "text/html");
    const tiles = Array.from(dom.querySelectorAll("[data-gallery-item]"));
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      expect.stringContaining("Cap 3"), expect.stringContaining("Cap 4"), expect.stringContaining("Cap 5")
    ]);
    expect(tiles[0].textContent).toContain("Credit: A. Ng");
    expect(tiles[0].textContent).toContain("Alt text: Alt three");
    expect(tiles[1].textContent).toContain("Credit: B. Cho");
    expect(tiles[2].textContent).toContain("Credit: C. Diaz");
    // Only the edited picture carries the note; it never claims to show the old bytes.
    expect(tiles.map((tile) => tile.querySelector("[data-media-changed]") !== null)).toEqual([false, true, false]);
    expect(tiles[1].textContent).toContain("may differ from what the writer sent");
    expect(dom.querySelectorAll("figure > [data-media-changed]")).toHaveLength(0);
  });

  it("says when a gallery picture has no caption or alt text, rather than leaving it blank", () => {
    const value = story([{ type: "block", fields: { blockType: "gallery", items: [{ media: 3, caption: "", altOverride: "" }, { media: 4, caption: "Has one", altOverride: "" }] } }]);
    const html = render(value, [file(3, { alt: "" }), file(4)]);
    expect(html).toContain("No caption");
    expect(html).toContain("No alt text");
  });

  it("shows the submitted version's byline under the deck, or under the headline when there is no deck", () => {
    expect(render(story([p("Body")], { deck: "A deck." }), [], { byline: ["Caroline Elrod", "Addyson Reed"] })).toMatch(/A deck\.<\/p><p[^>]*data-review-byline[^>]*>By Caroline Elrod, Addyson Reed/);
    expect(render(story([p("Body")]), [], { byline: ["Caroline Elrod"] })).toMatch(/<\/h1><p[^>]*data-review-byline[^>]*>By Caroline Elrod/);
    expect(render(story([p("Body")], { deck: "A deck." }), [])).not.toContain("data-review-byline");
  });

  it("names non-image files instead of pretending to show them", () => {
    const html = render(story([{ type: "block", fields: { blockType: "document", media: 5 } }]), [file(5, { kind: "document", filename: "budget.pdf", mimeType: "application/pdf" })]);
    expect(html).toContain("budget.pdf");
    expect(html).not.toContain("<img");
  });

  it("never renders markup from media text", () => {
    const html = render(story([photo(7, "<script>alert(1)</script>", '"><img src=x onerror=alert(1)>')]), [file(7)]);
    const dom = new DOMParser().parseFromString(html, "text/html");
    expect(dom.querySelectorAll("script")).toHaveLength(0);
    expect(dom.querySelectorAll("img")).toHaveLength(1);
    expect(dom.querySelector("[onerror]")).toBeNull();
    expect(dom.querySelector("figcaption")!.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("changes since your last review", () => {
  const before = story([p("The canteen closed in May."), p("Students bring lunch."), photo(7, "Cap")], { featuredMedia: 9 });
  const after = story([p("The canteen closed in May."), p("Students bring lunch from home."), photo(8, "Cap")], { featuredMedia: 9 });
  const comparison = compareVersions(buildReviewBlocks(before), buildReviewBlocks(after));
  const changes = { blocks: new Map(comparison.blocks.map((change) => [change.id, change])), removed: comparison.removed, visuals: comparison.visuals };

  it("shows a replaced photo where it is, labelled, so a reviewer sees the visual change as well as the words", () => {
    const html = render(after, [file(9), file(8)], { changes, changesOnly: true });
    expect(html).toContain("Photo replaced since your last review");
    expect(html).toContain('src="/media/8-preview.jpg"');
    // The lead image did not move, so it is left out of the changes lens.
    expect(html).not.toContain('src="/media/9-preview.jpg"');
  });

  it("labels an added photo and an alt-text-only change, and lists a removed visual on its own", () => {
    const base = story([p("Intro."), photo(7, "Cap", "Old alt")]);
    const next = story([p("Intro."), photo(7, "Cap", "New alt"), photo(8, "Fresh")]);
    const diff = compareVersions(buildReviewBlocks(base), buildReviewBlocks(next));
    const html = render(next, [file(7), file(8)], { changes: { blocks: new Map(diff.blocks.map((change) => [change.id, change])), removed: diff.removed, visuals: diff.visuals }, changesOnly: true });
    expect(html).toContain("Photo alt text changed since your last review");
    expect(html).toContain("Photo added since your last review");
    const gone = compareVersions(buildReviewBlocks(next), buildReviewBlocks(base));
    const removedHtml = render(base, [file(7)], { changes: { blocks: new Map(gone.blocks.map((change) => [change.id, change])), removed: gone.removed, visuals: gone.visuals }, changesOnly: true });
    expect(removedHtml).toContain("data-review-removed-visuals");
    expect(removedHtml).toContain("Removed since your last review");
  });

  it("separates a deleted word from the word that replaces it", () => {
    const html = render(story([p("We kept holding bake sales.")]), [], { changesOnly: true, changes: { blocks: new Map([["b0", { id: "b0", status: "changed" as const, parts: [{ text: "We kept", change: "removed" as const }, { text: "Bake", change: "added" as const }, { text: " sales.", change: "same" as const }] }]]), removed: [] } });
    expect(html).toMatch(/<del[^>]*>We kept<\/del><ins[^>]*ml-1[^>]*>Bake<\/ins>/);
  });

  it("shows only what moved, word by word, with unchanged passages left out", () => {
    const html = render(after, [file(9), file(8)], { changes, changesOnly: true });
    expect(html).toContain("<ins");
    expect(html).toContain("from home");
    expect(html).not.toContain("The canteen closed in May.");
    expect(html).toContain("Edited since your last review");
  });

  it("keeps the whole story readable with the submitted words, so comment anchors still line up", () => {
    const html = render(after, [file(9), file(8)], { changes });
    expect(html).toContain("The canteen closed in May.");
    expect(html).not.toContain("<ins");
    expect(html).toContain("Edited since your last review");
  });

  it("shows a removed paragraph struck through where it used to be", () => {
    const gone = story([p("The canteen closed in May."), photo(7, "Cap")], { featuredMedia: 9 });
    const diff = compareVersions(buildReviewBlocks(before), buildReviewBlocks(gone));
    const html = render(gone, [file(9), file(7)], { changes: { blocks: new Map(diff.blocks.map((change) => [change.id, change])), removed: diff.removed }, changesOnly: true });
    expect(html).toContain("Removed since your last review");
    expect(html).toContain("Students bring lunch.");
  });
});
