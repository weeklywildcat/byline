import { useBlockProps } from '@wordpress/block-editor';
import { Button, RangeControl, TextControl, TextareaControl } from '@wordpress/components';
import { registerBlockType } from '@wordpress/blocks';
import { useSelect } from '@wordpress/data';
import { useEffect, useRef, useState } from '@wordpress/element';
import { changeAnnotations, clampCoordinate, MAX_ANNOTATIONS, newAnnotationId, type Annotation } from '../story/models';
import { flattenStory } from '../story/headings';
import { StoryMedia } from '../story/media';
import { AnnotatedImageSave } from './save';
import metadata from './block.json';
import './style.css';
function Edit({ attributes: a, setAttributes, clientId }: any) {
  const notes: Annotation[] = a.annotations;
  const [selected, setSelected] = useState(notes[0]?.id || '');
  const dragging = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusNote = useRef(false);
  const priorIds = useSelect((select) => {
    const all = flattenStory((select('core/block-editor') as any).getBlocks());
    const earlier = all.slice(0, all.findIndex((block) => block.clientId === clientId));
    return earlier.filter((block) => block.name === 'byline/annotated-image').flatMap((block) => (block.attributes.annotations || []).map((note: Annotation) => note.id));
  }, [clientId]);
  useEffect(() => {
    if (notes.some((note) => priorIds.includes(note.id))) setAttributes({ annotations: notes.map((note) => ({ ...note, id: newAnnotationId() })) });
  }, [priorIds, notes, setAttributes]);
  useEffect(() => {
    if (focusNote.current) root.current?.querySelector<HTMLInputElement>(`[data-note-id="${selected}"] input`)?.focus();
    focusNote.current = false;
  }, [notes, selected]);
  function update(id: string, values: Partial<Annotation>) { setAttributes({ annotations: notes.map((note) => note.id === id ? { ...note, ...values } : note) }); }
  function add(x = 50, y = 50) {
    if (notes.length >= MAX_ANNOTATIONS) return;
    const id = newAnnotationId(); focusNote.current = true; setSelected(id);
    setAttributes({ annotations: changeAnnotations(notes, 'add', id, { x, y }) });
  }
  function point(event: { clientX: number; clientY: number }, canvas: HTMLElement) {
    const rect = canvas.getBoundingClientRect();
    return { x: clampCoordinate(100 * (event.clientX - rect.left) / rect.width), y: clampCoordinate(100 * (event.clientY - rect.top) / rect.height) };
  }
  return <div {...useBlockProps({ className: 'byline-annotated-image' })} ref={root}>
    <StoryMedia label="annotation image" image={a.image} onChange={(image) => setAttributes({ image })} />
    {a.image?.url && <div className="byline-annotation-canvas" onClick={(event) => {
      if ((event.target as Element).closest('button')) return;
      const p = point(event, event.currentTarget); add(p.x, p.y);
    }} onPointerMove={(event) => { if (dragging.current) update(dragging.current, point(event, event.currentTarget)); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      <img src={a.image.url} alt={a.image.alt} />
      {notes.map((note, index) => <button type="button" key={note.id} aria-label={`Select annotation ${index + 1}`} aria-pressed={selected === note.id} className={`byline-annotation-marker${selected === note.id ? ' is-active' : ''}`} style={{ left: `clamp(16px, ${note.x}%, calc(100% - 16px))`, top: `clamp(16px, ${note.y}%, calc(100% - 16px))`, touchAction: 'none' }} onPointerDown={(event) => { dragging.current = note.id; event.currentTarget.setPointerCapture(event.pointerId); setSelected(note.id); }} onClick={(event) => { event.stopPropagation(); setSelected(note.id); }}>{index + 1}</button>)}
    </div>}
    <Button variant="secondary" disabled={!a.image?.url || notes.length >= MAX_ANNOTATIONS} onClick={() => add()}>Add annotation</Button>
    <p aria-live="polite">{notes.length} / {MAX_ANNOTATIONS} annotations. Use X/Y controls or drag a marker to position it.</p>
    {notes.map((note, index) => <div key={note.id} data-note-id={note.id}>
      <TextControl __nextHasNoMarginBottom label={`Annotation ${index + 1} title`} value={note.title} onFocus={() => setSelected(note.id)} onChange={(title: string) => update(note.id, { title })} />
      <TextareaControl __nextHasNoMarginBottom label={`Annotation ${index + 1} explanation`} value={note.body} onChange={(body: string) => update(note.id, { body })} />
      <RangeControl __nextHasNoMarginBottom label={`Annotation ${index + 1} X position`} min={0} max={100} value={note.x} onChange={(x?: number) => update(note.id, { x: clampCoordinate(x ?? 50) })} />
      <RangeControl __nextHasNoMarginBottom label={`Annotation ${index + 1} Y position`} min={0} max={100} value={note.y} onChange={(y?: number) => update(note.id, { y: clampCoordinate(y ?? 50) })} />
      <Button variant="secondary" disabled={index === 0} onClick={() => { focusNote.current = true; setSelected(note.id); setAttributes({ annotations: changeAnnotations(notes, 'up', note.id) }); }}>Move annotation up</Button>
      <Button variant="secondary" disabled={index === notes.length - 1} onClick={() => { focusNote.current = true; setSelected(note.id); setAttributes({ annotations: changeAnnotations(notes, 'down', note.id) }); }}>Move annotation down</Button>
      <Button variant="tertiary" isDestructive onClick={() => { focusNote.current = true; setSelected(notes[index + 1]?.id || notes[index - 1]?.id || ''); setAttributes({ annotations: changeAnnotations(notes, 'remove', note.id) }); }}>Remove annotation</Button>
    </div>)}
    <TextControl __nextHasNoMarginBottom label="Caption" value={a.caption} onChange={(caption: string) => setAttributes({ caption })} />
  </div>;
}
registerBlockType(metadata as any, { edit: Edit, save: AnnotatedImageSave as any });
