import { useBlockProps } from '@wordpress/block-editor';
import { StoryImageMarkup } from '../story/image';
import { comparisonAspect, normalizeFit } from './model';

/**
 * Both complete photographs, labelled, in order: the figure reads as a
 * before-and-after pair without JavaScript, and the enhancer turns it into the
 * slider. Credits are added when the article renders, and a comparison missing
 * a photograph prints nothing for readers.
 */
export function BeforeAfterSave({ attributes: a }: any) {
  const fit = normalizeFit(a.fit);
  const aspect = comparisonAspect(a.before, a.after, fit);
  return <figure {...useBlockProps.save({ className: 'byline-before-after' })} data-fit={fit}>
    <div className="byline-comparison-images" style={aspect ? { '--comparison-aspect': String(aspect) } as any : undefined}>
      {a.before?.url && <div className="byline-comparison-image"><strong data-before>{a.beforeLabel || 'Before'}</strong><StoryImageMarkup image={a.before} /></div>}
      {a.after?.url && <div className="byline-comparison-image"><strong data-after>{a.afterLabel || 'After'}</strong><StoryImageMarkup image={a.after} /></div>}
    </div>
    {a.caption && <figcaption>{a.caption}</figcaption>}
  </figure>;
}
