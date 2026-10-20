import { useBlockProps } from '@wordpress/block-editor';
import { StoryImageMarkup } from '../story/image';
import { clampCoordinate, publishedAnnotations, type Annotation } from '../story/models';

/** Keeps the whole circle inside the photograph however close to an edge the marker sits. */
export function markerPosition(note: Pick<Annotation, 'x' | 'y'>) {
  return { left: `clamp(16px, ${clampCoordinate(note.x)}%, calc(100% - 16px))`, top: `clamp(16px, ${clampCoordinate(note.y)}%, calc(100% - 16px))` };
}

/**
 * Markers are links to their notes, so the saved figure is a complete, ordered
 * article section without JavaScript. A marker with no text is left out (it
 * would point at nothing), and the credit is added when the article renders.
 */
export function AnnotatedImageSave({ attributes: a }: any) {
  const props = useBlockProps.save({ className: 'byline-annotated-image' });
  if (!a.image?.url) return <figure {...props} />;
  const notes = publishedAnnotations(a.annotations);
  return <figure {...props}>
    <div className="byline-annotation-layout">
      <div className="byline-annotation-canvas">
        <StoryImageMarkup image={a.image} />
        {notes.map((note, index) => <a key={note.id} className="byline-annotation-marker" href={`#annotation-${note.id}`} style={markerPosition(note)} aria-label={`Annotation ${index + 1}: ${note.title || 'Read annotation'}`}>{index + 1}</a>)}
      </div>
      {notes.length > 0 && <ol className="byline-annotations" role="list">{notes.map((note) => <li key={note.id} id={`annotation-${note.id}`} tabIndex={0}>{note.title && <h3>{note.title}</h3>}{note.body && <p>{note.body}</p>}</li>)}</ol>}
    </div>
    {a.caption && <figcaption>{a.caption}</figcaption>}
  </figure>;
}
