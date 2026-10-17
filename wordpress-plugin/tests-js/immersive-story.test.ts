// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createBlock, getBlockType, registerBlockType, parse, serialize, validateBlock } from '@wordpress/blocks';
import { createElement } from '@wordpress/element';
import { headingAnchorUpdates, headingSlug, storyHeadings } from '../src/blocks/story/headings';
import { changeAnnotations, clampCoordinate, imageFromMedia, mismatchedRatios } from '../src/blocks/story/models';
import { storyVariations, supportedAttributes } from '../src/story-block-variations/definitions';
import { VisualizationSave } from '../src/blocks/visualization/save';
import { AnnotatedImageSave } from '../src/blocks/annotated-image/save';
import { BeforeAfterSave } from '../src/blocks/before-after/save';
import { ScrollySave } from '../src/blocks/scrolly/save';
import { ScrollyStepSave } from '../src/blocks/scrolly-step/save';
import visualization from '../src/blocks/visualization/block.json';
import annotated from '../src/blocks/annotated-image/block.json';
import comparison from '../src/blocks/before-after/block.json';
import scrolly from '../src/blocks/scrolly/block.json';
import step from '../src/blocks/scrolly-step/block.json';

const image = { id: 17, url: '/image.jpg', alt: 'A plan', width: 1200, height: 800, credit: 'Staff' };
const block = (name: string, content: string, clientId: string, extra = {}, innerBlocks: any[] = []): any => ({ name, clientId, attributes: { content, ...extra }, innerBlocks });

describe('stable native heading anchors', () => {
  it('traverses nested groups/columns, preserves manual anchors, ignores empty and unrelated headings', () => {
    const blocks = [block('core/heading', 'Changed title', 'manual', { anchor: 'manual', level: 2 }),
      block('core/group', '', 'group', {}, [block('core/heading', '<em>Déjà</em> vu &amp; us', 'nested', { level: 2 }), block('core/heading', 'Déjà vu &amp; us', 'duplicate', { level: 3 })]),
      block('core/heading', '  <em></em> ', 'empty'), block('core/heading', 'Excluded', 'h4', { level: 4 })];
    const updates = headingAnchorUpdates(blocks);
    expect(updates).toEqual([{ clientId: 'nested', anchor: 'deja-vu-us' }, { clientId: 'duplicate', anchor: 'deja-vu-us-2' }]);
    blocks[1].innerBlocks[0].attributes.anchor = 'deja-vu-us';
    blocks[1].innerBlocks[0].attributes.content = 'An edited heading';
    expect(headingAnchorUpdates(blocks)).toEqual([{ clientId: 'duplicate', anchor: 'deja-vu-us-2' }]);
    expect(storyHeadings(blocks)).toHaveLength(2);
    expect(headingAnchorUpdates(blocks, 2)).toEqual([]);
    expect(headingSlug('!!!')).toBe('section');
    expect(headingSlug('学校')).toBe('学校');
  });
});

describe('new semantic Core presets', () => {
  it('keeps media/Core defaults, aside semantics, editable columns and filtered optional attributes', () => {
    const byTitle = (title: string) => storyVariations.find((item) => item.title === title)!;
    expect(byTitle('Visual Chapter')).toMatchObject({ block: 'core/cover', attributes: { align: 'full', dimRatio: 40, contentPosition: 'center center' } });
    for (const [title, core, align] of [['Wide Photo','core/image','wide'],['Full-Bleed Photo','core/image','full'],['Full-Bleed Video','core/video','full']]) expect(byTitle(title)).toMatchObject({ block: core, attributes: { align } });
    expect(byTitle('Full-Bleed Video').attributes).toMatchObject({ controls: true, autoplay: false });
    expect(byTitle('Why It Matters').attributes).toMatchObject({ tagName: 'aside', className: 'is-style-byline-why-it-matters' });
    expect(byTitle('Comparison')).toMatchObject({ block: 'core/columns', attributes: { align: 'wide' } });
    expect(byTitle('Main + Aside').innerBlocks!.map((column) => column[1]?.width)).toEqual(['65%', '35%']);
    expect(byTitle('Three Key Numbers').innerBlocks).toHaveLength(3);
    expect(byTitle('Map')).toMatchObject({ block: 'byline/visualization', attributes: { type: 'map', heightPreset: 'map' } });
    expect(supportedAttributes(byTitle('Visual Chapter').attributes, { className: {}, align: {} })).toEqual({ className: 'is-style-byline-visual-chapter', align: 'full' });
  });
});

describe('annotation and comparison models', () => {
  it('clamps percentages and adds/removes/reorders stable IDs without mutating', () => {
    expect([-10, 125, NaN, 23].map(clampCoordinate)).toEqual([0,100,50,23]);
    const first = changeAnnotations([], 'add', 'a', { x: -1, y: 101 });
    const second = changeAnnotations(first, 'add', 'b');
    expect(first[0]).toMatchObject({ id: 'a', x: 0, y: 100 });
    expect(changeAnnotations(second, 'up', 'b').map((note) => note.id)).toEqual(['b','a']);
    expect(changeAnnotations(second, 'down', 'a').map((note) => note.id)).toEqual(['b','a']);
    expect(changeAnnotations(second, 'remove', 'a').map((note) => note.id)).toEqual(['b']);
    expect(changeAnnotations(first, 'add', 'a')).toBe(first);
    expect(Array.from({ length: 13 }).reduce((notes: any, _, i) => changeAnnotations(notes, 'add', String(i)), [])).toHaveLength(12);
  });
  it('warns on different proportions and never substitutes captions for alt text', () => {
    expect(mismatchedRatios(image, { ...image, height: 1600 })).toBe(true);
    expect(mismatchedRatios(image, { ...image })).toBe(false);
    expect(mismatchedRatios({ url: '', alt: '' }, image)).toBe(false);
    expect(imageFromMedia({ id: 1, source_url: '/a.jpg', caption: { rendered: 'Caption is not alt' } }).alt).toBe('');
  });
});

function setup() {
  for (const [metadata, save] of [[visualization, VisualizationSave], [annotated, AnnotatedImageSave], [comparison, BeforeAfterSave], [scrolly, ScrollySave], [step, ScrollyStepSave]] as const) {
    if (!getBlockType(metadata.name)) registerBlockType(metadata as any, { save: save as any });
  }
  if (!getBlockType('core/paragraph')) registerBlockType('core/paragraph', { apiVersion: 3, title: 'Paragraph', category: 'text', attributes: { content: { type: 'string', source: 'html', selector: 'p' } }, save: ({ attributes }: any) => createElement('p', null, attributes.content) });
}
function roundtrip(name: string, attributes: any, children: any[] = []) {
  setup();
  const html = serialize(createBlock(name, attributes, children));
  const [reopened] = parse(html);
  expect(validateBlock(reopened)[0]).toBe(true);
  expect(serialize(reopened)).toBe(html);
  const root = document.createElement('div'); root.innerHTML = html;
  return root;
}

describe('semantic saved story content', () => {
  it('serializes provider fallback rather than scripts or iframe markup', () => {
    const root = roundtrip('byline/visualization', { title: 'Budget', mode: 'embed', embedUrl: 'https://datawrapper.dwcdn.net/AbCdE/1/', image, source: 'District records' });
    expect(root.querySelectorAll('script,iframe')).toHaveLength(0);
    expect(root.querySelector('a')!.href).toBe('https://datawrapper.dwcdn.net/AbCdE/1/');
    expect(root.querySelector('img')!.alt).toBe('A plan');
    const invalid = roundtrip('byline/visualization', { embedUrl: 'javascript:alert(1)' });
    expect(invalid.querySelector('[data-src],a')).toBeNull();
  });
  it('links stable marker identities to a complete ordered annotation list', () => {
    const root = roundtrip('byline/annotated-image', { image, annotations: [{ id: 'stable-id', x: 12, y: 70, title: 'New entrance', body: 'Accessible from the street.' }] });
    expect(root.querySelector('a')!.getAttribute('href')).toBe('#annotation-stable-id');
    expect(root.querySelector('#annotation-stable-id')!.textContent).toContain('Accessible from the street.');
  });
  it('retains both labeled complete images and safe incomplete comparisons', () => {
    const root = roundtrip('byline/before-after', { before: image, after: { ...image, url: '/after.jpg' } });
    expect(root.querySelectorAll('img')).toHaveLength(2);
    expect(root.textContent).toContain('Before'); expect(root.textContent).toContain('After');
    expect(root.querySelector('input')).toBeNull();
    const incomplete = roundtrip('byline/before-after', { before: image });
    expect(incomplete.querySelectorAll('img')).toHaveLength(1);
    expect(incomplete.textContent).toContain('Choose both photographs');
  });
  it('keeps every step image and text in order with a constrained parent/child model', () => {
    setup();
    expect(step.parent).toEqual(['byline/scrolly']);
    expect(scrolly.allowedBlocks).toEqual(['byline/scrolly-step']);
    expect(step.allowedBlocks).not.toContain('core/embed');
    const steps = [1,2].map((i) => createBlock('byline/scrolly-step', { image: { ...image, url: `/step-${i}.jpg` } }, [createBlock('core/paragraph', { content: `Reporting ${i}` })]));
    const root = roundtrip('byline/scrolly', {}, steps);
    expect(Array.from(root.querySelectorAll('img')).map((img) => img.getAttribute('src'))).toEqual(['/step-1.jpg','/step-2.jpg']);
    expect(root.textContent).toMatch(/Reporting 1.*Reporting 2/s);
  });
});
