import { InnerBlocks, useBlockProps } from '@wordpress/block-editor';
import { LegacyStoryImageMarkup as StoryImageMarkup } from '../story/image'; // 0.3.24 markup until this block's save moves to the slim one (with a deprecation)
export function ScrollyStepSave({ attributes: a }: any) {
  return <section {...useBlockProps.save({ className: 'byline-scrolly-step' })}>
    {a.image?.url && <figure className="byline-scrolly-media"><StoryImageMarkup image={a.image} />{(a.caption || a.image.credit) && <figcaption>{a.caption}{a.image.credit && <p>Photo: {a.image.credit}</p>}</figcaption>}</figure>}
    <div className="byline-scrolly-text"><InnerBlocks.Content /></div>
  </section>;
}
