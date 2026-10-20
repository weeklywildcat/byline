import { InnerBlocks, useBlockProps } from '@wordpress/block-editor';
import { LegacyStoryImageMarkup } from '../story/image';
import metadata from './block.json';

/** Byline 0.3.24 and earlier saved a `srcset` snapshot and the credit inside the figure. */
function LegacyScrollyStepSave({ attributes: a }: any) {
  return <section {...useBlockProps.save({ className: 'byline-scrolly-step' })}>
    {a.image?.url && <figure className="byline-scrolly-media"><LegacyStoryImageMarkup image={a.image} />{(a.caption || a.image.credit) && <figcaption>{a.caption}{a.image.credit && <p>Photo: {a.image.credit}</p>}</figcaption>}</figure>}
    <div className="byline-scrolly-text"><InnerBlocks.Content /></div>
  </section>;
}

/** The responsive candidates and the credit are resolved from the attachment now; drop the stale copies. */
function slimImage(image: any) {
  if (!image?.url) return image;
  const { srcSet, sizes, credit, ...rest } = image;
  return rest;
}

export const deprecated = [{
  attributes: metadata.attributes,
  supports: metadata.supports,
  save: LegacyScrollyStepSave,
  migrate: (attributes: any) => ({ ...attributes, image: slimImage(attributes.image) })
}];
