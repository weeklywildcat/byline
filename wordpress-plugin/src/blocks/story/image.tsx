import type { StoryImage } from './models';

/** Photograph markup for newly saved story blocks: no baked-in `srcset`, `sizes` or credit. */
export function StoryImageMarkup({ image }: { image?: StoryImage }) {
  if (!image?.url) return null;
  return <img src={image.url} alt={image.alt || ''} width={image.width || undefined} height={image.height || undefined} loading="lazy" className={image.id ? `wp-image-${image.id}` : undefined} />;
}

/** Byline 0.3.24 markup, kept so those saved blocks still validate and migrate (see each block's deprecated.ts). */
export function LegacyStoryImageMarkup({ image }: { image?: StoryImage }) {
  if (!image?.url) return null;
  return <img src={image.url} alt={image.alt || ''} width={image.width || undefined} height={image.height || undefined} srcSet={image.srcSet || undefined} sizes={image.srcSet ? image.sizes || '(max-width: 760px) 100vw, 1040px' : undefined} loading="lazy" className={image.id ? `wp-image-${image.id}` : undefined} />;
}
