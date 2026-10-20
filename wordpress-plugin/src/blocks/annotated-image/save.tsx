import { useBlockProps } from '@wordpress/block-editor';
import { LegacyStoryImageMarkup as StoryImageMarkup } from '../story/image'; // 0.3.24 markup until this block's save moves to the slim one (with a deprecation)
import { clampCoordinate, type Annotation } from '../story/models';
export function AnnotatedImageSave({ attributes: a }: any) {
  if (!a.image?.url) return <figure {...useBlockProps.save({ className: 'byline-annotated-image' })}><p>Annotated image pending.</p></figure>;
  return <figure {...useBlockProps.save({ className: 'byline-annotated-image' })}>
    <div className="byline-annotation-layout">
      <div className="byline-annotation-canvas"><StoryImageMarkup image={a.image} />
        {(a.annotations as Annotation[]).map((note, index) => <a key={note.id} className="byline-annotation-marker" href={`#annotation-${note.id}`} style={{ left: `clamp(16px, ${clampCoordinate(note.x)}%, calc(100% - 16px))`, top: `clamp(16px, ${clampCoordinate(note.y)}%, calc(100% - 16px))` }} aria-label={`Annotation ${index + 1}: ${note.title || 'Read annotation'}`}>{index + 1}</a>)}
      </div>
      <ol className="byline-annotations">{(a.annotations as Annotation[]).map((note) => <li key={note.id} id={`annotation-${note.id}`} tabIndex={0}>{note.title && <h3>{note.title}</h3>}{note.body && <p>{note.body}</p>}</li>)}</ol>
    </div>
    {(a.caption || a.image.credit) && <figcaption>{a.caption}{a.image.credit && <p>Photo: {a.image.credit}</p>}</figcaption>}
  </figure>;
}
