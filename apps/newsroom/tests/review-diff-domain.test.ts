import { describe, expect, it } from "vitest";
import { changedCategories, storyFingerprint } from "../src/domain/review";
import { buildReviewBlocks, mediaIdsOf, type SubmittedStory } from "../src/domain/review-blocks";
import { compareVersions, copySummary, visualSummary, wordDiff } from "../src/domain/review-diff";

const p = (text: string) => ({ type: "paragraph", children: [{ type: "text", text }] });
const photo = (media: number, caption = "", altOverride = "", placement = "wide") => ({ type: "block", fields: { blockType: "photo", id: `p${media}`, media, caption, altOverride, placement } });
const gallery = (...media: number[]) => ({ type: "block", fields: { blockType: "gallery", id: "g", fit: "natural", layout: "grid", items: media.map((id) => ({ id: `i${id}`, media: id, caption: `c${id}`, altOverride: "" })) } });
const story = (children: unknown[], extra: Partial<SubmittedStory> = {}): SubmittedStory => ({ headline: "Canteen could return", deck: "", body: { root: { type: "root", children } as never }, ...extra });
const blocks = (value: SubmittedStory) => buildReviewBlocks(value);

describe("reviewable blocks", () => {
  it("number the text, and carry each media block's files, captions and per-use alt text", () => {
    const result = blocks(story([p("One."), photo(7, "A line", "Alt"), gallery(3, 4), p("Two.")], { featuredMedia: { id: 9 }, featuredCaption: "Lead cap" }));
    expect(result.map((block) => [block.id, block.kind])).toEqual([["headline", "headline"], ["lead", "lead"], ["b0", "paragraph"], ["b1", "media"], ["b2", "media"], ["b3", "paragraph"]]);
    expect(result[1]!.media).toEqual({ label: "Lead image", uses: [{ mediaId: 9, caption: "Lead cap", alt: "" }] });
    expect(result[3]!.media).toEqual({ label: "Photo", uses: [{ mediaId: 7, caption: "A line", alt: "Alt" }] });
    expect(result[4]!.media!.uses.map((use) => use.mediaId)).toEqual([3, 4]);
    expect(mediaIdsOf(result)).toEqual([9, 7, 3, 4]);
  });
});

describe("approval fingerprints on real stored blocks", () => {
  const base = story([p("The canteen closed in May."), photo(7, "Old caption")], { featuredMedia: 9 });
  const categories = (next: SubmittedStory) => changedCategories(storyFingerprint(base as never), storyFingerprint(next as never));

  it("treat a replaced photo as visuals, not copy", () => {
    expect(categories(story([p("The canteen closed in May."), photo(8, "Old caption")], { featuredMedia: 9 }))).toEqual(["visuals"]);
  });
  it("treat a caption fix as copy, so it never sends the Visual Desk a story again", () => {
    expect(categories(story([p("The canteen closed in May."), photo(7, "Fixed caption")], { featuredMedia: 9 }))).toEqual(["copy"]);
    expect(categories(story([p("The canteen closed in May."), photo(7, "Old caption")], { featuredMedia: 9, featuredCaption: "New lead caption" }))).toEqual(["copy"]);
  });
  it("treat alt text, layout and a swapped lead as visuals", () => {
    expect(categories(story([p("The canteen closed in May."), photo(7, "Old caption", "Students in line")], { featuredMedia: 9 }))).toEqual(["visuals"]);
    expect(categories(story([p("The canteen closed in May."), photo(7, "Old caption", "", "narrow")], { featuredMedia: 9 }))).toEqual(["visuals"]);
    expect(categories(story([p("The canteen closed in May."), photo(7, "Old caption")], { featuredMedia: 10 }))).toEqual(["visuals"]);
  });
  it("see an added gallery as visuals (and its captions as copy), and ignore whitespace", () => {
    expect(categories(story([p("The  canteen closed in May. "), photo(7, "Old caption"), gallery(1)], { featuredMedia: 9 }))).toEqual(["copy", "visuals"]);
    expect(categories(story([p("The  canteen closed in May. "), photo(7, "Old caption")], { featuredMedia: 9 }))).toEqual([]);
  });
});

describe("wordDiff", () => {
  it("marks only the words that changed", () => {
    expect(wordDiff("The canteen closed in May.", "The canteen reopened in May.")).toEqual([
      { text: "The canteen ", change: "same" },
      { text: "closed", change: "removed" },
      { text: "reopened", change: "added" },
      { text: " in May.", change: "same" }
    ]);
    expect(wordDiff("Same.", "Same.")).toEqual([{ text: "Same.", change: "same" }]);
  });
});

describe("compareVersions: what changed since I last reviewed this", () => {
  const before = blocks(story([p("The canteen closed in May after the district ended its contract."), p("Students now bring lunch."), p("Principal Smith declined to comment."), photo(7, "Cap"), photo(8)], { featuredMedia: 9 }));

  it("says nothing changed when nothing did", () => {
    const result = compareVersions(before, blocks(story([p("The canteen closed in May after the district ended its contract."), p("Students now bring lunch."), p("Principal Smith declined to comment."), photo(7, "Cap"), photo(8)], { featuredMedia: 9 })));
    expect(result).toMatchObject({ blocks: [], removed: [], visuals: [], counts: { changed: 0, added: 0, removed: 0 } });
    expect(copySummary(result.counts)).toBe("");
  });

  it("finds one edited sentence among untouched ones, so a reviewer rereads one passage", () => {
    const after = blocks(story([p("The canteen closed in May after the district ended its contract."), p("Students now bring lunch from home."), p("Principal Smith declined to comment."), photo(7, "Cap"), photo(8)], { featuredMedia: 9 }));
    const result = compareVersions(before, after);
    expect(result.counts).toEqual({ changed: 1, added: 0, removed: 0 });
    expect(result.blocks).toEqual([{ id: "b1", status: "changed", parts: [{ text: "Students now bring lunch", change: "same" }, { text: " from home", change: "added" }, { text: ".", change: "same" }] }]);
    expect(copySummary(result.counts)).toBe("1 passage edited");
  });

  it("finds added and removed paragraphs and where the removed one used to be", () => {
    const after = blocks(story([p("The canteen closed in May after the district ended its contract."), p("Students now bring lunch."), p("A new paragraph about prices at the vending machines."), photo(7, "Cap"), photo(8)], { featuredMedia: 9 }));
    const result = compareVersions(before, after);
    expect(result.blocks.map((change) => [change.id, change.status])).toEqual([["b2", "added"]]);
    expect(result.removed).toEqual([{ after: "b1", kind: "paragraph", text: "Principal Smith declined to comment." }]);
    expect(copySummary(result.counts)).toBe("1 added · 1 removed");
  });

  it("compares media by which files appear where: replaced lead, added gallery, removed photo, alt text", () => {
    const after = blocks(story([p("The canteen closed in May after the district ended its contract."), p("Students now bring lunch."), p("Principal Smith declined to comment."), photo(7, "Cap", "Now with alt text"), gallery(1, 2)], { featuredMedia: 10 }));
    const result = compareVersions(before, after);
    expect(result.visuals).toEqual([
      { change: "replaced", where: "Lead image", before: [9], after: [10] },
      { change: "details", where: "Photo", before: [7], after: [7] },
      { change: "removed", where: "Photo", before: [8], after: [] },
      { change: "added", where: "Gallery", before: [], after: [1, 2] }
    ]);
    expect(visualSummary(result.visuals)).toContain("Lead image replaced");
  });

  it("shows a caption fix with the copy, on the photo it belongs to", () => {
    const after = blocks(story([p("The canteen closed in May after the district ended its contract."), p("Students now bring lunch."), p("Principal Smith declined to comment."), photo(7, "A fixed cap"), photo(8)], { featuredMedia: 9 }));
    const result = compareVersions(before, after);
    expect(result.visuals).toEqual([]);
    expect(result.blocks).toMatchObject([{ id: "b3", status: "changed" }]);
  });
});
