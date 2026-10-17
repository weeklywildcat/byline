import type { StoryImage } from './models';
export function StoryImageMarkup({ image }: { image?: StoryImage }) {
  if (!image?.url) return null;
  return <img src={image.url} alt={image.alt || ''} width={image.width || undefined} height={image.height || undefined} srcSet={image.srcSet || undefined} sizes={image.srcSet ? image.sizes || '(max-width: 760px) 100vw, 1040px' : undefined} loading="lazy" className={image.id ? `wp-image-${image.id}` : undefined} />;
}
