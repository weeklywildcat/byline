import { BlockControls, InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { Button, PanelBody, RangeControl, ToolbarButton, ToolbarGroup, VisuallyHidden, Notice } from '@wordpress/components';
import { useRegistry } from '@wordpress/data';
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { arrowDown, arrowUp, plus, trash } from '@wordpress/icons';
import { flattenStory } from '../story/headings';
import { StoryCaption } from '../story/fields';
import { StoryImageInspector, StoryImagePlaceholder, StoryImageToolbar, useStoryImage } from '../story/media';
import {
  changeAnnotations, MAX_ANNOTATIONS, newAnnotationId, nextMarkerPoint, nudgeAnnotation, roundCoordinate, updateAnnotation, withFreshIds,
  isAnnotationEmpty, type Annotation
} from '../story/models';
import { markerPosition } from './save';

/** Annotated Image blocks whose IDs have been checked, so a block that arrives later is the one that changes. */
const checkedBlocks = new Set<string>();

type Focus = { id: string; target: 'marker' | 'title' };
type Gesture = { id: string; startX: number; startY: number; moved: boolean };

const pointIn = (event: { clientX: number; clientY: number }, element: Element) => {
  const rect = element.getBoundingClientRect();
  return { x: roundCoordinate(100 * (event.clientX - rect.left) / rect.width), y: roundCoordinate(100 * (event.clientY - rect.top) / rect.height) };
};
const percent = (note: Pick<Annotation, 'x' | 'y'>) => `${Math.round(note.x)}%, ${Math.round(note.y)}%`;

/**
 * The block canvas is the editor. Markers sit on the photograph exactly as
 * readers see them; the selected marker's note is typed in place in the list
 * beside (or below) the photograph. Selection follows the marker you click,
 * drag or focus, and every pointer action has a keyboard equivalent:
 * arrows nudge, [ and ] reorder, Delete removes, Enter moves to the text.
 */
export function AnnotatedImageEdit({ attributes: a, setAttributes, clientId, isSelected }: any) {
  const notes: Annotation[] = a.annotations;
  const registry = useRegistry();
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const clickWasDrag = useRef(false);
  /** Whether the block was already selected when the press began: the click that selects a block must not also drop a marker. */
  const selectedOnPress = useRef(false);
  const [selectedId, setSelectedId] = useState('');
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);
  const onImage = useCallback((image: any) => { setPhotoFailed(false); setAttributes({ image }); }, [setAttributes]);
  const photo = useStoryImage(a.image, onImage);

  /** The store is updated before React re-renders, so edits made in quick succession must start from it, not from this render's props. */
  const latest = (): Annotation[] => (registry.select('core/block-editor') as any).getBlockAttributes(clientId)?.annotations ?? notes;
  const commit = (next: Annotation[]) => setAttributes({ annotations: next });

  // A duplicated or pasted block arrives with the original's IDs, which are the notes' public anchors.
  useEffect(() => {
    const others = flattenStory((registry.select('core/block-editor') as any).getBlocks())
      .filter((block) => block.name === 'byline/annotated-image' && block.clientId !== clientId && checkedBlocks.has(block.clientId));
    const current = latest();
    const fresh = withFreshIds(current, new Set(others.flatMap((block) => (block.attributes.annotations || []).map((note: Annotation) => note.id))));
    if (fresh !== current) {
      (registry.dispatch('core/block-editor') as any).__unstableMarkNextChangeAsNotPersistent?.();
      commit(fresh);
    }
    checkedBlocks.add(clientId);
    return () => { checkedBlocks.delete(clientId); };
  }, []);

  useEffect(() => {
    if (!focus) return;
    const target = focus.target === 'title' ? `[data-note-id="${focus.id}"] .byline-annotation-title-field` : `[data-marker-id="${focus.id}"]`;
    const element = root.current?.querySelector<HTMLElement>(target);
    if (!element) return;
    element.focus();
    setFocus(null);
  }, [focus, notes, selectedId]);

  const selected = notes.find((note) => note.id === selectedId);
  const selectedIndex = selected ? notes.indexOf(selected) : -1;
  const atLimit = notes.length >= MAX_ANNOTATIONS;

  function add(point = nextMarkerPoint(latest().length)) {
    if (latest().length >= MAX_ANNOTATIONS) { setAnnouncement(`A story can have up to ${MAX_ANNOTATIONS} markers.`); return; }
    const id = newAnnotationId();
    const position = latest().length + 1;
    commit(changeAnnotations(latest(), 'add', id, point));
    setSelectedId(id);
    setFocus({ id, target: 'title' });
    setAnnouncement(`Marker ${position} added at ${percent(point)}. Type its title and explanation.`);
  }
  function move(id: string, direction: 'up' | 'down', refocus?: Focus) {
    const before = latest();
    const next = changeAnnotations(before, direction, id);
    if (next === before) return;
    commit(next);
    if (refocus) setFocus(refocus);
    setAnnouncement(`Marker moved to position ${next.findIndex((note) => note.id === id) + 1} of ${next.length}.`);
  }
  function remove(id: string, focusNeighbour = false) {
    const before = latest();
    const index = before.findIndex((note) => note.id === id);
    if (index < 0) return;
    const neighbour = before[index + 1] ?? before[index - 1];
    commit(changeAnnotations(before, 'remove', id));
    setSelectedId(neighbour?.id ?? '');
    if (focusNeighbour && neighbour) setFocus({ id: neighbour.id, target: 'marker' });
    else root.current?.focus();
    setAnnouncement(`Marker ${index + 1} removed. ${before.length - 1} of ${MAX_ANNOTATIONS} markers.`);
  }
  const update = (id: string, values: Partial<Omit<Annotation, 'id'>>) => commit(updateAnnotation(latest(), id, values));

  function markerKeys(event: any, note: Annotation) {
    // Gutenberg's writing flow moves focus on arrow keys and removes the block on Backspace; claim them first.
    const claim = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key.startsWith('Arrow')) {
      claim();
      const next = nudgeAnnotation(latest(), note.id, event.key, event.shiftKey);
      commit(next);
      const moved = next.find((item) => item.id === note.id)!;
      setAnnouncement(`Marker ${next.indexOf(moved) + 1} at ${percent(moved)}.`);
    } else if (event.key === '[' || event.key === ']') {
      claim();
      move(note.id, event.key === '[' ? 'up' : 'down', { id: note.id, target: 'marker' });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      claim();
      remove(note.id, true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      claim();
      setSelectedId(note.id);
      setFocus({ id: note.id, target: 'title' });
    } else if (event.key === 'Escape') {
      claim();
      root.current?.focus();
    }
  }

  function startDrag(event: any, note: Annotation) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gesture.current = { id: note.id, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(note.id);
  }
  function continueDrag(event: any) {
    const current = gesture.current;
    if (!current || !canvas.current) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 4) return;
    current.moved = true;
    setDrag({ id: current.id, ...pointIn(event, canvas.current) });
  }
  function endDrag(event: any) {
    const current = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!current?.moved || !canvas.current) return;
    clickWasDrag.current = true;
    const point = pointIn(event, canvas.current);
    commit(updateAnnotation(latest(), current.id, point));
    setAnnouncement(`Marker moved to ${percent(point)}.`);
  }

  const toolbar = <BlockControls>
    <ToolbarGroup>
      <ToolbarButton icon={plus} label="Add marker" disabled={atLimit} onClick={() => add()} />
      <ToolbarButton icon={arrowUp} label="Move marker earlier" shortcut="[" disabled={!selected || selectedIndex === 0} onClick={() => move(selectedId, 'up')} />
      <ToolbarButton icon={arrowDown} label="Move marker later" shortcut="]" disabled={!selected || selectedIndex === notes.length - 1} onClick={() => move(selectedId, 'down')} />
      <ToolbarButton icon={trash} label="Remove marker" shortcut="Delete" disabled={!selected} onClick={() => remove(selectedId)} />
    </ToolbarGroup>
  </BlockControls>;

  const blockProps = useBlockProps({ className: 'byline-annotated-image', ref: root });
  if (!a.image?.url) {
    return <div {...blockProps}>
      <StoryImagePlaceholder title="Annotated Image" instructions="Choose a photograph, then click it to add numbered markers that explain what readers should notice." onSelect={photo.select} />
    </div>;
  }
  return <div {...blockProps}>
    <StoryImageToolbar image={a.image} name="Replace photograph" onSelect={photo.select} />
    {toolbar}
    <StoryImageInspector image={a.image} credit={photo.credit} problem={photo.problem} onAlt={photo.setAlt} />
    <InspectorControls>
      <PanelBody title={selected ? `Marker ${selectedIndex + 1}` : 'Markers'} initialOpen>
        {selected ? <>
          <RangeControl __nextHasNoMarginBottom label="Left to right (%)" min={0} max={100} step={0.1} value={selected.x} onChange={(x?: number) => update(selected.id, { x: x ?? 50 })} />
          <RangeControl __nextHasNoMarginBottom label="Top to bottom (%)" min={0} max={100} step={0.1} value={selected.y} onChange={(y?: number) => update(selected.id, { y: y ?? 50 })} />
          <p className="components-base-control__help">Drag a marker on the photograph, or focus it and use the arrow keys (Shift moves 10%). [ and ] change its order and Delete removes it.</p>
        </> : <p className="components-base-control__help">Select a marker on the photograph to place it precisely.</p>}
      </PanelBody>
    </InspectorControls>
    {photo.problem === 'missing' && <Notice status="error" isDismissible={false}>This photograph is no longer in the media library. Replace it before publishing.</Notice>}
    <div className="byline-annotation-layout">
      <div className="byline-annotation-canvas" ref={canvas}
        onPointerDownCapture={() => { clickWasDrag.current = false; selectedOnPress.current = isSelected; }}
        onClick={(event) => {
          if (!selectedOnPress.current || clickWasDrag.current || (event.target as Element).closest('.byline-annotation-marker')) return;
          add(pointIn(event, event.currentTarget));
        }}>
        {photoFailed
          ? <p className="byline-annotation-missing" role="status">This photograph could not be loaded. Replace it from the toolbar.</p>
          : <img src={a.image.url} alt={a.image.alt || ''} draggable={false} onError={() => setPhotoFailed(true)} />}
        {notes.map((note, index) => {
          const placed = drag?.id === note.id ? { ...note, x: drag.x, y: drag.y } : note;
          return <button type="button" key={note.id} data-marker-id={note.id} className={`byline-annotation-marker${note.id === selectedId ? ' is-active' : ''}${isAnnotationEmpty(note) ? ' is-unfinished' : ''}`}
            aria-label={`Marker ${index + 1}${note.title ? `: ${note.title}` : ''}`} aria-pressed={note.id === selectedId} style={{ ...markerPosition(placed), touchAction: 'none' }}
            onKeyDownCapture={(event) => markerKeys(event, note)} onFocus={() => setSelectedId(note.id)}
            onPointerDown={(event) => startDrag(event, note)} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={() => { gesture.current = null; setDrag(null); }}
            onClick={(event) => { event.stopPropagation(); setSelectedId(note.id); }}>{index + 1}</button>;
        })}
        {isSelected && !notes.length && <p className="byline-annotation-hint" aria-hidden="true">Click the photograph to place a marker</p>}
      </div>
      <div className="byline-annotation-notes">
        {notes.length > 0 && <ol className="byline-annotations" role="list" aria-label="Marker notes">
          {notes.map((note, index) => note.id === selectedId
            ? <li key={note.id} data-note-id={note.id} className="is-active is-editing">
              <StoryCaption singleLine className="byline-annotation-title-field" label={`Marker ${index + 1} title`} placeholder="Title: what is this?" value={note.title} onChange={(title: string) => update(note.id, { title })} />
              <StoryCaption className="byline-annotation-body-field" label={`Marker ${index + 1} explanation`} placeholder="What should readers notice here?" value={note.body} onChange={(body: string) => update(note.id, { body })} />
              <div className="byline-annotation-actions" role="group" aria-label={`Marker ${index + 1} actions`}>
                <Button size="small" icon={arrowUp} label="Move marker earlier" disabled={index === 0} onClick={() => move(note.id, 'up', { id: note.id, target: 'marker' })} />
                <Button size="small" icon={arrowDown} label="Move marker later" disabled={index === notes.length - 1} onClick={() => move(note.id, 'down', { id: note.id, target: 'marker' })} />
                <Button size="small" icon={trash} label="Remove marker" isDestructive onClick={() => remove(note.id)} />
              </div>
            </li>
            : <li key={note.id} data-note-id={note.id} onClick={() => { setSelectedId(note.id); setFocus({ id: note.id, target: 'title' }); }}>
              {isAnnotationEmpty(note)
                ? <p className="byline-annotation-unfinished">No text yet. A marker is published only once it has a title or explanation.</p>
                : <>{note.title && <h3>{note.title}</h3>}{note.body && <p>{note.body}</p>}</>}
            </li>)}
        </ol>}
        <div className="byline-annotation-add">
          <Button variant="tertiary" icon={plus} disabled={atLimit} onClick={() => add()}>Add marker</Button>
          <span>{notes.length} of {MAX_ANNOTATIONS}</span>
        </div>
        {!notes.length && <p className="byline-annotation-empty">Click the photograph to place a marker, then type what readers should notice. Drag markers to adjust them.</p>}
      </div>
    </div>
    <StoryCaption label="Caption" placeholder="Add a caption: what the photograph shows" value={a.caption} onChange={(caption: string) => setAttributes({ caption })} />
    {photo.credit && <p className="byline-story-image-credit">Photo: {photo.credit}</p>}
    {isSelected && !a.image.alt && <p className="byline-story-editor-note">No alternative text yet. Add it in the sidebar so readers using screen readers know what this photograph shows.</p>}
    <VisuallyHidden><div role="status" aria-live="polite">{announcement}</div></VisuallyHidden>
  </div>;
}
