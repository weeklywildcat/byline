// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "@wordpress/element";
import { createBlock, getBlockType, parse, registerBlockType, serialize, validateBlock } from "@wordpress/blocks";
import { storyVariations, supportedAttributes, isStoryVariationActive } from "../src/story-block-variations/definitions";
import { changeTimeline, MAX_TIMELINE_ITEMS } from "../src/blocks/timeline/items";
import timelineMetadata from "../src/blocks/timeline/block.json";

vi.mock("@wordpress/block-editor", () => ({
  useBlockProps: { save: (props: Record<string, unknown>) => ({ ...props, className: `wp-block-byline-timeline ${props.className}` }) },
  RichText: { Content: ({ tagName, value, ...props }: any) => createElement(tagName, { ...props, dangerouslySetInnerHTML: { __html: value } }) }
}));
import { TimelineSave } from "../src/blocks/timeline/save";

describe("semantic newsroom presets", () => {
  it("offers the ten Core/existing-block presets with stable style identities", () => {
    expect(storyVariations.map(({ title, block }) => [title, block])).toEqual([
      ["Portrait + Text", "core/media-text"], ["Photo Pair", "core/gallery"], ["Photo Gallery", "core/gallery"],
      ["Reported Quote", "core/quote"], ["Pull Quote", "core/pullquote"], ["Key Facts", "core/group"],
      ["Document Viewer", "core/file"], ["Related Coverage", "byline/stories"], ["Story Audio", "core/audio"], ["Story Video", "core/video"]
    ]);
    expect(new Set(storyVariations.map((v) => v.name)).size).toBe(10);
    for (const variation of storyVariations) {
      expect(variation.keywords.length).toBeGreaterThan(1);
      expect(isStoryVariationActive(variation, variation.attributes)).toBe(true);
      expect(isStoryVariationActive(variation, {})).toBe(false);
    }
  });
  it("uses safe media and compact related-story defaults", () => {
    const attrs = (name: string) => storyVariations.find((v) => v.name === name)!.attributes;
    expect(attrs("byline-portrait-text")).toMatchObject({ align: "wide", mediaWidth: 40, imageFill: false, isStackedOnMobile: true });
    expect(attrs("byline-photo-pair")).toMatchObject({ columns: 2, imageCrop: false, align: "wide" });
    expect(attrs("byline-photo-gallery")).toMatchObject({ linkTo: "media", randomOrder: false, imageCrop: false });
    expect(attrs("byline-related-coverage")).toMatchObject({ layout: "related", source: "manual", limit: 3, showByline: false, showDate: false, showExcerpt: false });
    expect(attrs("byline-document")).toMatchObject({ displayPreview: true, previewHeight: 640, showDownloadButton: true });
    for (const name of ["byline-story-audio", "byline-story-video"]) expect(attrs(name)).toMatchObject({ autoplay: false, preload: "metadata" });
    expect(attrs("byline-story-video")).toMatchObject({ controls: true, playsInline: true });
    const facts = storyVariations.find((v) => v.title === "Key Facts")!;
    expect(facts.innerBlocks![0]).toEqual(["core/heading", { level: 3, content: "Key facts" }]);
    expect(facts.innerBlocks![1][2]).toHaveLength(3);
  });
  it("filters unsupported optional attributes rather than inventing Core schema", () => {
    expect(supportedAttributes({ className: "x", displayPreview: true, previewHeight: 640 }, { className: {}, displayPreview: {} })).toEqual({ className: "x", displayPreview: true });
  });
});

describe("Timeline", () => {
  const items = timelineMetadata.attributes.items.default;
  it("adds, removes, reorders and returns the intended focus position without mutating input", () => {
    expect(changeTimeline(items, "up", 1)).toEqual({ items: [items[1], items[0]], focusIndex: 0 });
    expect(changeTimeline(items, "down", 0)).toEqual({ items: [items[1], items[0]], focusIndex: 1 });
    expect(changeTimeline(items, "remove", 1)).toEqual({ items: [items[0]], focusIndex: 0 });
    expect(changeTimeline(items, "add").focusIndex).toBe(2);
    expect(items).toHaveLength(2);
    expect(changeTimeline([items[0]], "remove", 0).items).toHaveLength(1);
    expect(changeTimeline(items, "up", 0).items).toBe(items);
    expect(changeTimeline(Array.from({ length: MAX_TIMELINE_ITEMS }, () => items[0]), "add").items).toHaveLength(25);
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
