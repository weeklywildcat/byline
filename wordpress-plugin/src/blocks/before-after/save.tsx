import { useBlockProps } from '@wordpress/block-editor';
import { LegacyStoryImageMarkup as StoryImageMarkup } from '../story/image'; // 0.3.24 markup until this block's save moves to the slim one (with a deprecation)
export function BeforeAfterSave({ attributes: a }: any) {
  return <figure {...useBlockProps.save({ className: 'byline-before-after' })}>
    {(!a.before?.url || !a.after?.url) && <p>Choose both photographs to complete this comparison.</p>}
    <div className="byline-comparison-images">
      {a.before?.url && <div className="byline-comparison-image"><strong data-before>{a.beforeLabel || 'Before'}</strong><StoryImageMarkup image={a.before} /></div>}
      {a.after?.url && <div className="byline-comparison-image"><strong data-after>{a.afterLabel || 'After'}</strong><StoryImageMarkup image={a.after} /></div>}
    </div>
    {(a.caption || a.before?.credit || a.after?.credit) && <figcaption>{a.caption}{a.before?.credit && <p>{a.beforeLabel || 'Before'} photo: {a.before.credit}</p>}{a.after?.credit && <p>{a.afterLabel || 'After'} photo: {a.after.credit}</p>}</figcaption>}
  </figure>;
}
