import { useBlockProps } from '@wordpress/block-editor';
import { Button, RangeControl } from '@wordpress/components';
import { registerBlockType } from '@wordpress/blocks';
import { useRegistry, useSelect } from '@wordpress/data';
import { useEffect, useRef, useState } from '@wordpress/element';
import { changeAnnotations, clampCoordinate, MAX_ANNOTATIONS, newAnnotationId, type Annotation } from '../story/models';
import { flattenStory } from '../story/headings';
import { StoryMedia } from '../story/media';
import { StoryTextControl, StoryTextareaControl } from '../story/fields';
import { AnnotatedImageSave } from './save';
import metadata from './block.json';
import './style.css';
function Edit({ attributes: a, setAttributes, clientId }: any) {
  const notes: Annotation[] = a.annotations;
  const registry = useRegistry();
  /** The store is updated before React re-renders, so edits made in quick succession must start from it, not from this render's props. */
  const latest = (): Annotation[] => (registry.select('core/block-editor') as any).getBlockAttributes(clientId)?.annotations ?? notes;
  const [selected, setSelected] = useState(notes[0]?.id || '');
  const dragging = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  /** Focus is handed to a note's title once the list it was requested for has actually re-rendered. */
  const pendingFocus = useRef<{ id: string; ids: string }| null>(null);
  const priorIds = useSelect((select) => {
    const all = flattenStory((select('core/block-editor') as any).getBlocks());
    const earlier = all.slice(0, all.findIndex((block) => block.clientId === clientId));
    return earlier.filter((block) => block.name === 'byline/annotated-image').flatMap((block) => (block.attributes.annotations || []).map((note: Annotation) => note.id));
  }, [clientId]);
  useEffect(() => {
    if (notes.some((note) => priorIds.includes(note.id))) setAttributes({ annotations: notes.map((note) => ({ ...note, id: newAnnotationId() })) });
  }, [priorIds, notes, setAttributes]);
  const idList = (items: Annotation[]) => items.map((note) => note.id).join('|');
  function focusNoteAfterChange(id: string) { pendingFocus.current = { id, ids: idList(latest()) }; setSelected(id); }
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request || idList(notes) === request.ids) return;
    pendingFocus.current = null;
    root.current?.querySelector<HTMLInputElement>(`[data-note-id="${request.id}"] input`)?.focus();
  }, [notes]);
  function update(id: string, values: Partial<Annotation>) { setAttributes({ annotations: latest().map((note) => note.id === id ? { ...note, ...values } : note) }); }
  /** New markers step across the image instead of stacking on top of one another. */
  function add(x = 50 + (notes.length % 5) * 8, y = 50 + (notes.length % 4) * 6) {
    if (latest().length >= MAX_ANNOTATIONS) return;
    const id = newAnnotationId(); focusNoteAfterChange(id);
    setAttributes({ annotations: changeAnnotations(latest(), 'add', id, { x, y }) });
  }
  function point(event: { clientX: number; clientY: number }, canvas: HTMLElement) {
    const rect = canvas.getBoundingClientRect();
    return { x: clampCoordinate(100 * (event.clientX - rect.left) / rect.width), y: clampCoordinate(100 * (event.clientY - rect.top) / rect.height) };
  }
  /** Keyboard-only positioning: arrows move the focused marker by 1%, Shift by 10%. */
  function nudge(event: { key: string; shiftKey: boolean; preventDefault: () => void; stopPropagation: () => void }, note: Annotation) {
    const step = event.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    // Gutenberg's writing flow moves focus on arrow keys; claim them before it sees them.
    event.preventDefault();
    event.stopPropagation();
    const current = latest().find((item) => item.id === note.id) ?? note;
    update(note.id, { x: clampCoordinate(current.x + delta[0]), y: clampCoordinate(current.y + delta[1]) });
  }
  return <div {...useBlockProps({ className: 'byline-annotated-image' })} ref={root}>
    <StoryMedia label="annotation image" image={a.image} onChange={(image) => setAttributes({ image })} />
    {a.image?.url && <div className="byline-annotation-canvas" onClick={(event) => {
      if ((event.target as Element).closest('button')) return;
      const p = point(event, event.currentTarget); add(p.x, p.y);
    }} onPointerMove={(event) => { if (dragging.current) update(dragging.current, point(event, event.currentTarget)); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      <img src={a.image.url} alt={a.image.alt} />
      {notes.map((note, index) => <button type="button" key={note.id} aria-label={`Select annotation ${index + 1}`} aria-pressed={selected === note.id} className={`byline-annotation-marker${selected === note.id ? ' is-active' : ''}`} style={{ left: `clamp(16px, ${note.x}%, calc(100% - 16px))`, top: `clamp(16px, ${note.y}%, calc(100% - 16px))`, touchAction: 'none' }} onKeyDownCapture={(event) => nudge(event, note)} onPointerDown={(event) => { dragging.current = note.id; event.currentTarget.setPointerCapture(event.pointerId); setSelected(note.id); }} onClick={(event) => { event.stopPropagation(); setSelected(note.id); }}>{index + 1}</button>)}
    </div>}
    <Button variant="secondary" disabled={!a.image?.url || notes.length >= MAX_ANNOTATIONS} onClick={() => add()}>Add annotation</Button>
    <p aria-live="polite">{notes.length} / {MAX_ANNOTATIONS} annotations. Position a marker with its X/Y controls, the arrow keys while it is focused (Shift for larger steps), or by dragging it.</p>
    {notes.map((note, index) => <div key={note.id} data-note-id={note.id}>
      <StoryTextControl label={`Annotation ${index + 1} title`} value={note.title} onFocus={() => setSelected(note.id)} onChange={(title: string) => update(note.id, { title })} />
      <StoryTextareaControl label={`Annotation ${index + 1} explanation`} value={note.body} onChange={(body: string) => update(note.id, { body })} />
      <RangeControl __nextHasNoMarginBottom label={`Annotation ${index + 1} X position`} min={0} max={100} value={note.x} onChange={(x?: number) => update(note.id, { x: clampCoordinate(x ?? 50) })} />
      <RangeControl __nextHasNoMarginBottom label={`Annotation ${index + 1} Y position`} min={0} max={100} value={note.y} onChange={(y?: number) => update(note.id, { y: clampCoordinate(y ?? 50) })} />
      <Button variant="secondary" disabled={index === 0} onClick={() => { focusNoteAfterChange(note.id); setAttributes({ annotations: changeAnnotations(latest(), 'up', note.id) }); }}>Move annotation up</Button>
      <Button variant="secondary" disabled={index === notes.length - 1} onClick={() => { focusNoteAfterChange(note.id); setAttributes({ annotations: changeAnnotations(latest(), 'down', note.id) }); }}>Move annotation down</Button>
      <Button variant="tertiary" isDestructive onClick={() => { focusNoteAfterChange(notes[index + 1]?.id || notes[index - 1]?.id || ''); setAttributes({ annotations: changeAnnotations(latest(), 'remove', note.id) }); }}>Remove annotation</Button>
    </div>)}
    <StoryTextControl label="Caption" value={a.caption} onChange={(caption: string) => setAttributes({ caption })} />
  </div>;
}
registerBlockType(metadata as any, { edit: Edit, save: AnnotatedImageSave as any });
