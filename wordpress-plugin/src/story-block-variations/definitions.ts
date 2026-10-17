/** Semantic newsroom presets. Core remains responsible for editing and serialization. */
export type StoryVariation = {
  block: string; name: string; title: string; icon: string; keywords: string[];
  attributes: Record<string, unknown>; innerBlocks?: [string, Record<string, unknown>?, unknown[]?][];
};
export const storyVariations: StoryVariation[] = [
  { block: "core/media-text", name: "byline-portrait-text", title: "Portrait + Text", icon: "align-pull-left", keywords: ["portrait", "photo", "image", "interview", "profile", "side by side"], attributes: { className: "is-style-byline-portrait-text", align: "wide", mediaPosition: "left", mediaWidth: 40, isStackedOnMobile: true, imageFill: false, verticalAlignment: "center" }, innerBlocks: [["core/paragraph", { placeholder: "Introduce the person behind the portrait…" }]] },
  { block: "core/gallery", name: "byline-photo-pair", title: "Photo Pair", icon: "format-gallery", keywords: ["two", "photos", "photographs"], attributes: { className: "is-style-byline-photo-pair", align: "wide", columns: 2, imageCrop: false, randomOrder: false, linkTo: "media" } },
  { block: "core/gallery", name: "byline-photo-gallery", title: "Photo Gallery", icon: "images-alt2", keywords: ["photographs", "slideshow", "images"], attributes: { className: "is-style-byline-photo-gallery", align: "wide", columns: 3, imageCrop: false, randomOrder: false, linkTo: "media" } },
  { block: "core/quote", name: "byline-reported-quote", title: "Reported Quote", icon: "format-quote", keywords: ["source", "interview", "attribution"], attributes: { className: "is-style-byline-source-quote" } },
  { block: "core/pullquote", name: "byline-pull-quote", title: "Pull Quote", icon: "format-quote", keywords: ["quotation", "feature"], attributes: { className: "is-style-byline-feature-quote" } },
  { block: "core/group", name: "byline-key-facts", title: "Key Facts", icon: "editor-ul", keywords: ["facts", "summary", "at a glance"], attributes: { className: "is-style-byline-key-facts" }, innerBlocks: [["core/heading", { level: 3, content: "Key facts" }], ["core/list", {}, [["core/list-item", { content: "Add a verified fact" }], ["core/list-item", { content: "Add another fact" }], ["core/list-item", { content: "Add a source or date" }]]]] },
  { block: "core/file", name: "byline-document", title: "Document Viewer", icon: "media-document", keywords: ["pdf", "document", "download", "records"], attributes: { className: "is-style-byline-document", displayPreview: true, previewHeight: 640, showDownloadButton: true } },
  { block: "byline/stories", name: "byline-related-coverage", title: "Related Coverage", icon: "admin-links", keywords: ["related", "stories", "coverage"], attributes: { heading: "Related coverage", source: "manual", layout: "related", limit: 3, showImage: true, showExcerpt: false, showByline: false, showDate: false } },
  { block: "core/audio", name: "byline-story-audio", title: "Story Audio", icon: "format-audio", keywords: ["listen", "podcast", "recording"], attributes: { className: "is-style-byline-story-audio", autoplay: false, loop: false, preload: "metadata" } },
  { block: "core/video", name: "byline-story-video", title: "Story Video", icon: "format-video", keywords: ["film", "recording", "watch"], attributes: { className: "is-style-byline-story-video", controls: true, autoplay: false, loop: false, preload: "metadata", playsInline: true } },
  { block: "core/cover", name: "byline-visual-chapter", title: "Visual Chapter", icon: "cover-image", keywords: ["chapter", "story break", "immersive", "feature"], attributes: { className: "is-style-byline-visual-chapter", align: "full", dimRatio: 40, overlayColor: "black", isDark: true, contentPosition: "center center" }, innerBlocks: [["core/heading", { level: 2, content: "A new chapter", textAlign: "center" }], ["core/paragraph", { placeholder: "Add a short introduction…", align: "center" }]] },
  ...([
    ["Wide Photo", "core/image", "wide", "byline-wide-photo"],
    ["Full-Bleed Photo", "core/image", "full", "byline-full-photo"],
    ["Full-Bleed Video", "core/video", "full", "byline-full-video"]
  ] as const).map(([title, block, align, name]) => ({ block, name, title, icon: "format-image", keywords: ["photograph", "media", "landscape", "feature"], attributes: { align, className: `is-style-${name}`, ...(block === "core/video" ? { controls: true, autoplay: false, loop: false, preload: "metadata", playsInline: true } : {}) } })),
  ...([
    ["Context", "context", "Explain the background readers need…"],
    ["Why It Matters", "why-it-matters", "Explain what this development means for the community…"],
    ["What's Next", "whats-next", "Explain the next decision, date or step…"],
    ["How We Know", "how-we-know", "Describe the records, interviews and reporting behind this story…"],
    ["Editor's Note", "editors-note", "Add an editorial explanation…"],
    ["Margin Note", "margin-note", "Add supporting context beside the reporting…"]
  ] as const).map(([title, slug, placeholder]): StoryVariation => ({ block: "core/group", name: `byline-${slug}`, title, icon: "info", keywords: ["context", "aside", "reporting", "sidebar"], attributes: { className: `is-style-byline-${slug}`, tagName: "aside" }, innerBlocks: [["core/heading", { level: 3, content: title }], ["core/paragraph", { placeholder }]] })),
  ...(["Data Table", "Comparison Table"] as const).map((title): StoryVariation => ({ block: "core/table", name: title === "Data Table" ? "byline-data-table" : "byline-comparison-table", title, icon: "editor-table", keywords: ["data", "figures", "budget", "statistics"], attributes: { className: title === "Data Table" ? "is-style-byline-data-table" : "is-style-byline-comparison-table", align: "wide", hasFixedLayout: false, head: [{ cells: [{ content: "Category", tag: "th" }, { content: "Value", tag: "th" }] }], body: [{ cells: [{ content: "Add a label", tag: "td" }, { content: "00", tag: "td" }] }] } })),
  ...(["Read More", "Methodology", "Full Statement"] as const).map((title): StoryVariation => ({ block: "core/details", name: `byline-${title.toLowerCase().replace(/ /g, "-")}`, title, icon: "editor-expand", keywords: ["details", "records", "explanation"], attributes: { className: `is-style-byline-${title.toLowerCase().replace(/ /g, "-")}`, summary: title, showContent: false }, innerBlocks: [["core/paragraph", { placeholder: "Add supporting reporting, sources or a statement…" }]] })),
  { block: "core/columns", name: "byline-comparison", title: "Comparison", icon: "columns", keywords: ["compare", "two", "columns"], attributes: { className: "is-style-byline-comparison", align: "wide", isStackedOnMobile: true }, innerBlocks: [["core/column", {}, [["core/heading", { level: 3, content: "One perspective" }], ["core/paragraph", { placeholder: "Add reporting…" }]]], ["core/column", {}, [["core/heading", { level: 3, content: "Another perspective" }], ["core/paragraph", { placeholder: "Add reporting…" }]]]] },
  { block: "core/columns", name: "byline-main-aside", title: "Main + Aside", icon: "columns", keywords: ["main", "aside", "sidebar"], attributes: { className: "is-style-byline-main-aside", align: "wide", isStackedOnMobile: true }, innerBlocks: [["core/column", { width: "65%" }, [["core/paragraph", { placeholder: "Add the main reporting…" }]]], ["core/column", { width: "35%" }, [["core/paragraph", { placeholder: "Add supporting context…" }]]]] },
  { block: "core/columns", name: "byline-key-numbers", title: "Three Key Numbers", icon: "chart-bar", keywords: ["figures", "statistics", "numbers"], attributes: { className: "is-style-byline-key-numbers", align: "wide", isStackedOnMobile: true }, innerBlocks: [1,2,3].map((n) => ["core/column", {}, [["core/heading", { level: 3, content: "00" }], ["core/paragraph", { content: `Label ${n}` }]]]) as StoryVariation["innerBlocks"] },
  { block: "byline/visualization", name: "byline-map", title: "Map", icon: "location", keywords: ["map", "geography", "location"], attributes: { className: "is-style-byline-map", type: "map", align: "wide", heightPreset: "map" } }

];

/** Optional Core attributes vary with WordPress; never assume a newer schema. */
export function supportedAttributes(attributes: Record<string, unknown>, schema: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => key in schema));
}
export function isStoryVariationActive(variation: StoryVariation, attributes: Record<string, unknown>) {
  return variation.attributes.className
    ? String(attributes.className || "").split(/\s+/).includes(String(variation.attributes.className))
    : attributes.layout === "related";
}
