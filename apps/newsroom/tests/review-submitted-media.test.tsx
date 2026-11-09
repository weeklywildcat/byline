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
  const changes = { blocks: new Map(comparison.blocks.map((change) => [change.id, change])), removed: comparison.removed };

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
