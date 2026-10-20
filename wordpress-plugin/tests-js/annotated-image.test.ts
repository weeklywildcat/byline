// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { createBlock, parse, serialize } from '@wordpress/blocks';
import { markerPosition } from '../src/blocks/annotated-image/save';
import { isAnnotationEmpty, nextMarkerPoint, nudgeAnnotation, publishedAnnotations, updateAnnotation, withFreshIds, type Annotation } from '../src/blocks/story/models';

const { addFilter } = createRequire(createRequire(import.meta.url).resolve('@wordpress/blocks'))('@wordpress/hooks');
const note = (id: string, values: Partial<Annotation> = {}): Annotation => ({ id, x: 40, y: 60, title: `Title ${id}`, body: `Body ${id}`, ...values });
const image = { id: 17, url: '/plan.jpg', alt: 'A floor plan', width: 1200, height: 800 };

/** The block exactly as the editor registers it (save and deprecations), with the wrapper classes block-editor adds when saving. */
beforeAll(async () => {
  addFilter('blocks.getSaveContent.extraProps', 'byline-test/annotated-wrapper', (props: any, blockType: any, attributes: any) => {
    const classes = [props.className, `wp-block-${blockType.name.replace(/^core\//, '').replace('/', '-')}`, attributes.align && `align${attributes.align}`].filter(Boolean);
    return { ...props, className: Array.from(new Set(classes.join(' ').split(' '))).join(' ') };
  });
  await import('../src/blocks/annotated-image');
});

describe('annotation editing models', () => {
  it('steps new markers across the photograph instead of stacking them', () => {
    const points = Array.from({ length: 12 }, (_, count) => nextMarkerPoint(count));
    expect(new Set(points.map(({ x, y }) => `${x},${y}`)).size).toBe(12);
    expect(points.every(({ x, y }) => x >= 0 && x <= 100 && y >= 0 && y <= 100)).toBe(true);
    expect(nextMarkerPoint(0)).toEqual({ x: 50, y: 50 });
  });

  it('updates one marker, clamps and rounds positions, and leaves the others untouched', () => {
    const items = [note('a'), note('b')];
    const next = updateAnnotation(items, 'a', { x: 120, y: -4 });
    expect(next[0]).toMatchObject({ id: 'a', x: 100, y: 0, title: 'Title a' });
    expect(next[1]).toBe(items[1]);
    expect(updateAnnotation(items, 'a', { title: 'New' })[0]).toMatchObject({ x: 40, y: 60, title: 'New' });
    expect(updateAnnotation(items, 'a', { x: 12.3456 })[0].x).toBe(12.3);
  });

  it('nudges by 1% with an arrow and 10% with Shift, within the photograph and never changing the ID', () => {
    const items = [note('a', { x: 50, y: 50 })];
    expect(nudgeAnnotation(items, 'a', 'ArrowRight')[0]).toMatchObject({ id: 'a', x: 51, y: 50 });
    expect(nudgeAnnotation(items, 'a', 'ArrowLeft', true)[0].x).toBe(40);
    expect(nudgeAnnotation(items, 'a', 'ArrowUp')[0].y).toBe(49);
    expect(nudgeAnnotation(items, 'a', 'ArrowDown', true)[0].y).toBe(60);
    expect(nudgeAnnotation([note('a', { x: 2, y: 99 })], 'a', 'ArrowLeft', true)[0].x).toBe(0);
    expect(nudgeAnnotation([note('a', { x: 2, y: 99 })], 'a', 'ArrowDown', true)[0].y).toBe(100);
    // Other keys and unknown markers change nothing.
    expect(nudgeAnnotation(items, 'a', 'a')).toBe(items);
    expect(nudgeAnnotation(items, 'missing', 'ArrowLeft')).toBe(items);
  });

  it('leaves out a marker with no text, but not one with only a title or only an explanation', () => {
    const items = [note('a'), note('b', { title: '  ', body: '' }), note('c', { title: '', body: 'Only text' }), note('d', { title: 'Only title', body: '' })];
    expect(items.map(isAnnotationEmpty)).toEqual([false, true, false, false]);
    expect(publishedAnnotations(items).map((item) => item.id)).toEqual(['a', 'c', 'd']);
  });

  it('gives only colliding notes fresh IDs, and the same array when nothing collides', () => {
    const items = [note('a'), note('b'), note('c')];
    expect(withFreshIds(items, new Set(['x', 'y']))).toBe(items);
    let counter = 0;
    const fresh = withFreshIds(items, new Set(['b', 'z']), () => `new-${++counter}`);
    expect(fresh.map((item) => item.id)).toEqual(['a', 'new-1', 'c']);
    expect(fresh[0]).toBe(items[0]);
    expect(fresh[1]).toMatchObject({ x: 40, y: 60, title: 'Title b', body: 'Body b' });
    // A copy of a whole block (every ID taken) is re-identified entirely, and a repeat inside one block is split.
    expect(withFreshIds(items, new Set(['a', 'b', 'c']), () => `n${++counter}`).map((item) => item.id)).toEqual(['n2', 'n3', 'n4']);
    expect(withFreshIds([note('a'), note('a')], new Set(), () => 'again').map((item) => item.id)).toEqual(['a', 'again']);
  });
});

describe('annotated image saved markup', () => {
  const html = (attributes: any) => serialize(createBlock('byline/annotated-image', attributes));
  const dom = (attributes: any) => { const root = document.createElement('div'); root.innerHTML = html(attributes); return root; };
  it('keeps each marker a real link to its own note and numbers both by order', () => {
    const root = dom({ image, annotations: [note('first'), note('second')] });
    const markers = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.byline-annotation-marker'));
    expect(markers.map((marker) => marker.getAttribute('href'))).toEqual(['#annotation-first', '#annotation-second']);
    expect(markers.map((marker) => marker.textContent)).toEqual(['1', '2']);
    expect(Array.from(root.querySelectorAll('.byline-annotations > li'), (item) => item.id)).toEqual(['annotation-first', 'annotation-second']);
    expect(markers[0].getAttribute('aria-label')).toBe('Annotation 1: Title first');
    expect(root.querySelector('ol')!.getAttribute('role')).toBe('list');
  });

  it('positions markers with the same clamp as before so published anchors and places never move', () => {
    expect(markerPosition({ x: 12.5, y: 70 })).toEqual({ left: 'clamp(16px, 12.5%, calc(100% - 16px))', top: 'clamp(16px, 70%, calc(100% - 16px))' });
    expect(markerPosition({ x: 300, y: -1 })).toEqual({ left: 'clamp(16px, 100%, calc(100% - 16px))', top: 'clamp(16px, 0%, calc(100% - 16px))' });
  });

  it('prints no baked-in responsive candidates or credit, and no editor instruction', () => {
    const root = dom({ image: { ...image, srcSet: '/a.jpg 1w', sizes: '100vw', credit: 'Staff' }, annotations: [note('a')], caption: 'The plan.' });
    expect(root.querySelector('img')!.hasAttribute('srcset')).toBe(false);
    expect(root.querySelector('img')!.hasAttribute('sizes')).toBe(false);
    expect(root.querySelector('figcaption')!.textContent).toBe('The plan.');
    expect(dom({ image: {}, annotations: [] }).querySelector('figure')!.children).toHaveLength(0);
  });

  it('publishes a photograph without notes as just the photograph, and drops unfinished markers', () => {
    const bare = dom({ image, annotations: [] });
    expect(bare.querySelector('.byline-annotations')).toBeNull();
    expect(bare.querySelector('.byline-annotation-marker')).toBeNull();
    expect(bare.querySelector('figcaption')).toBeNull();
    const partial = dom({ image, annotations: [note('keep'), note('blank', { title: '', body: '' })] });
    expect(partial.querySelectorAll('.byline-annotation-marker')).toHaveLength(1);
    expect(partial.querySelector('#annotation-blank')).toBeNull();
  });
});

describe('0.3.24 annotated image content migrates', () => {
  it('drops the baked-in candidates and credit, keeps every marker and ID, and validates', () => {
    const markup = readFileSync(resolve(process.cwd(), '../tests/fixtures/storytelling/legacy-0.3.24-lunch-squeeze.html'), 'utf8');
    const [block] = parse(markup).filter((item: any) => item.name === 'byline/annotated-image');
    expect(block.isValid).toBe(true);
    expect(block.attributes.image.srcSet).toBeUndefined();
    expect(block.attributes.image.sizes).toBeUndefined();
    expect(block.attributes.image.credit).toBeUndefined();
    expect(block.attributes.annotations.map((item: Annotation) => item.id)).toEqual(['a1', 'a2', 'a3']);
    // Saving it again writes the slim markup with the same anchors.
    const resaved = serialize(block);
    expect(resaved).not.toContain('srcset');
    expect(resaved).toContain('href="#annotation-a2"');
    expect(resaved).toContain('id="annotation-a3"');
  });
});
