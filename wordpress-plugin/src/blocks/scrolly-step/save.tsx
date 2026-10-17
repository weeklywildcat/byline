import { InnerBlocks, useBlockProps } from '@wordpress/block-editor';
import { StoryImageMarkup } from '../story/image';
export function ScrollyStepSave({ attributes: a }: any) {
  return <section {...useBlockProps.save({ className: 'byline-scrolly-step' })}>
    {a.image?.url && <figure className="byline-scrolly-media"><StoryImageMarkup image={a.image} />{(a.caption || a.image.credit) && <figcaption>{a.caption}{a.image.credit && <p>Photo: {a.image.credit}</p>}</figcaption>}</figure>}
    <div className="byline-scrolly-text"><InnerBlocks.Content /></div>
  </section>;
}
