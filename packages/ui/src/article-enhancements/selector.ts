/**
 * Elements that need the shared article enhancer. Kept in its own dependency-free
 * module so the article route can test for them without downloading the
 * enhancer, and so plain text stories never load the interactive bundle.
 *
 * `.wp-block-gallery img` is deliberate: Photo Gallery images may be unlinked, and
 * the enhancer generates their opener (see gallery.ts).
 */
export const articleEnhancementSelector = [
  ".wp-block-gallery img",
  '.byline-visualization[data-mode="embed"]',
  ".byline-annotated-image",
  ".byline-before-after",
  ".byline-scrolly"
].join(", ");
