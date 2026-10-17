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
  { block: "core/video", name: "byline-story-video", title: "Story Video", icon: "format-video", keywords: ["film", "recording", "watch"], attributes: { className: "is-style-byline-story-video", controls: true, autoplay: false, loop: false, preload: "metadata", playsInline: true } }
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
