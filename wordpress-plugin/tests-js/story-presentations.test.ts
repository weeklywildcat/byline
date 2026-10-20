// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "@wordpress/element";
import { createBlock, getBlockType, parse, registerBlockType, serialize, validateBlock } from "@wordpress/blocks";
import { storyVariations, supportedAttributes, isStoryVariationActive } from "../src/story-block-variations/definitions";
import { addEvent, MAX_TIMELINE_ITEMS, moveEvent, removeEvent } from "../src/blocks/timeline/items";
import timelineMetadata from "../src/blocks/timeline/block.json";

vi.mock("@wordpress/block-editor", () => ({
  useBlockProps: { save: (props: Record<string, unknown>) => ({ ...props, className: `wp-block-byline-timeline ${props.className}` }) },
  RichText: { Content: ({ tagName, value, ...props }: any) => createElement(tagName, { ...props, dangerouslySetInnerHTML: { __html: value } }) }
}));
import { TimelineSave } from "../src/blocks/timeline/save";

describe("semantic newsroom presets", () => {
  it("offers one preset per editorial need, in task order, with stable style identities", () => {
    expect(storyVariations.map(({ title, block }) => [title, block])).toEqual([
      // Photographs and video
      ["Photo Gallery", "core/gallery"], ["Portrait + Text", "core/media-text"], ["Visual Chapter", "core/cover"],
      // Reporting and evidence
      ["Reported Quote", "core/quote"], ["Pull Quote", "core/pullquote"], ["Key Facts", "core/group"], ["Context Box", "core/group"],
      ["Margin Note", "core/group"], ["Editor's Note", "core/group"], ["Expandable Section", "core/details"], ["Document Viewer", "core/file"],
      // Data, maps and comparisons
      ["Data Table", "core/table"], ["Comparison", "core/columns"], ["Three Key Numbers", "core/columns"], ["Map", "byline/visualization"],
      // Supporting context and related coverage
      ["Related Coverage", "byline/stories"]
    ]);
    // Presets that only repeated a Core default or another preset are not offered (their classes still render).
    for (const retired of ["Photo Pair", "Wide Photo", "Full-Bleed Photo", "Full-Bleed Video", "Story Audio", "Story Video", "Why It Matters", "What's Next", "How We Know", "Methodology", "Full Statement", "Comparison Table", "Main + Aside", "Read More"]) {
      expect(storyVariations.find((v) => v.title === retired), retired).toBeUndefined();
    }
    expect(new Set(storyVariations.map((v) => v.name)).size).toBe(storyVariations.length);
    for (const variation of storyVariations) {
      expect(variation.keywords.length).toBeGreaterThan(1);
      expect(variation.description.length, `${variation.title} needs a sentence of guidance`).toBeGreaterThan(30);
      expect(isStoryVariationActive(variation, variation.attributes)).toBe(true);
      expect(isStoryVariationActive(variation, {})).toBe(false);
    }
  });
  it("uses safe media and compact related-story defaults", () => {
    const attrs = (name: string) => storyVariations.find((v) => v.name === name)!.attributes;
    expect(attrs("byline-portrait-text")).toMatchObject({ align: "wide", mediaWidth: 40, imageFill: false, isStackedOnMobile: true });
    expect(attrs("byline-photo-gallery")).toMatchObject({ linkTo: "media", randomOrder: false, imageCrop: false });
    expect(attrs("byline-related-coverage")).toMatchObject({ layout: "related", source: "manual", limit: 3, showByline: false, showDate: false, showExcerpt: false });
    expect(attrs("byline-document")).toMatchObject({ displayPreview: true, previewHeight: 640, showDownloadButton: true });
    const facts = storyVariations.find((v) => v.title === "Key Facts")!;
    expect(facts.innerBlocks![0]).toEqual(["core/heading", { level: 3, content: "Key facts" }]);
    expect(facts.innerBlocks![1][2]).toHaveLength(3);
  });
  it("filters unsupported optional attributes rather than inventing Core schema", () => {
    expect(supportedAttributes({ className: "x", displayPreview: true, previewHeight: 640 }, { className: {}, displayPreview: {} })).toEqual({ className: "x", displayPreview: true });
  });
});

describe("Timeline", () => {
  const items = [{ label: "Earlier", title: "How it began", body: "" }, { label: "Now", title: "What happened next", body: "" }];
  it("adds, removes, reorders and returns the intended focus position without mutating input", () => {
    expect(moveEvent(items, 1, -1)).toEqual({ items: [items[1], items[0]], focusIndex: 0 });
    expect(moveEvent(items, 0, 1)).toEqual({ items: [items[1], items[0]], focusIndex: 1 });
    expect(removeEvent(items, 1)).toEqual({ items: [items[0]], focusIndex: 0 });
    expect(addEvent(items).focusIndex).toBe(2);
    expect(items).toHaveLength(2);
    expect(removeEvent([items[0]], 0).items).toEqual([{ label: "", title: "", body: "" }]);
    expect(moveEvent(items, 0, -1).items).toBe(items);
    expect(addEvent(Array.from({ length: MAX_TIMELINE_ITEMS }, () => items[0])).items).toHaveLength(25);
  });
  it("round-trips attributes, plain titles, inline body links and semantic saved markup", () => {
    if (!getBlockType("byline/timeline")) registerBlockType(timelineMetadata as any, { save: TimelineSave as any });
    const values = [{ label: "Fall 2026", title: "A <new> chapter", body: 'See <a href="/coverage/">the reporting</a>.' }, { label: "7:45 p.m.", title: "Decision", body: "" }];
    const markup = serialize(createBlock("byline/timeline", { items: values }));
    expect(markup).toContain('<ol class="wp-block-byline-timeline byline-timeline">');
    expect(markup.match(/<li /g)).toHaveLength(2);
    const fragment = document.createElement("div");
    fragment.innerHTML = markup;
    expect(fragment.querySelector("h3")!.textContent).toBe("A <new> chapter");
    expect(fragment.querySelector("h3 new")).toBeNull();
    expect(markup).toContain('<a href="/coverage/">the reporting</a>');
    expect(markup).not.toContain("<time");
    const [parsed] = parse(markup);
    expect(parsed.attributes.items).toEqual(values);
    expect(validateBlock(parsed)[0]).toBe(true);
    expect(serialize(parsed)).toBe(markup);
  });
  it("omits blank event headings while preserving labels, explanations and round-trip validity", () => {
    if (!getBlockType("byline/timeline")) registerBlockType(timelineMetadata as any, { save: TimelineSave as any });
    const values = [
      { label: "Fall 2026", title: "", body: "" },
      { label: "", title: " \t\n ", body: 'More <em>context</em> with <a href="/coverage/">reporting</a>.' },
      { label: "Now", title: "Decision", body: "The event continues." }
    ];
    const markup = serialize(createBlock("byline/timeline", { items: values }));
    const fragment = document.createElement("div");
    fragment.innerHTML = markup;
    expect(fragment.querySelectorAll("ol > li")).toHaveLength(3);
    expect(fragment.querySelectorAll("h3")).toHaveLength(1);
    expect(fragment.querySelector("h3")!.textContent).toBe("Decision");
    expect(fragment.querySelector("li:first-child .byline-timeline-label")!.textContent).toBe("Fall 2026");
    expect(fragment.querySelector("li:nth-child(2) .byline-timeline-body em")!.textContent).toBe("context");
    expect(fragment.querySelector("li:nth-child(2) a")!.getAttribute("href")).toBe("/coverage/");
    const [parsed] = parse(markup);
    expect(parsed.attributes.items).toEqual(values);
    expect(validateBlock(parsed)[0]).toBe(true);
    expect(serialize(parsed)).toBe(markup);
  });

});
