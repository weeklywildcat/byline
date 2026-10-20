import { InnerBlocks, useBlockProps } from '@wordpress/block-editor';
import { StoryImageMarkup } from '../story/image';

/** Credits are added when the article renders (includes/content/story-blocks.php), never saved. */
export function ScrollyStepSave({ attributes: a }: any) {
  return <section {...useBlockProps.save({ className: 'byline-scrolly-step' })}>
    {a.image?.url && <figure className="byline-scrolly-media"><StoryImageMarkup image={a.image} />{a.caption && <figcaption>{a.caption}</figcaption>}</figure>}
    <div className="byline-scrolly-text"><InnerBlocks.Content /></div>
  </section>;
}
