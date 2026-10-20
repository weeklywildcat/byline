// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { createBlock, parse, serialize } from '@wordpress/blocks';
import { comparisonState, enhanceBeforeAfter } from '../../packages/ui/src/article-enhancements/before-after';
import { comparisonAspect, comparisonCredit, normalizeFit } from '../src/blocks/before-after/model';

const { addFilter } = createRequire(createRequire(import.meta.url).resolve('@wordpress/blocks'))('@wordpress/hooks');
const landscape = { id: 9, url: '/before.jpg', alt: 'Before', width: 1600, height: 1067 };
const portrait = { id: 8, url: '/after.jpg', alt: 'After', width: 1600, height: 2000 };

/** The block exactly as the editor registers it (save and deprecations), with the wrapper classes block-editor adds when saving. */
beforeAll(async () => {
  addFilter('blocks.getSaveContent.extraProps', 'byline-test/comparison-wrapper', (props: any, blockType: any, attributes: any) => {
    const classes = [props.className, `wp-block-${blockType.name.replace(/^core\//, '').replace('/', '-')}`, attributes.align && `align${attributes.align}`].filter(Boolean);
    return { ...props, className: Array.from(new Set(classes.join(' ').split(' '))).join(' ') };
  });
  await import('../src/blocks/before-after');
});

describe('comparison frame', () => {
  it('sizes the frame from the Before photograph when cropping, and from the narrower one when showing both complete', () => {
    expect(comparisonAspect(landscape, portrait, 'cover')).toBe(1.5);
    expect(comparisonAspect(portrait, landscape, 'cover')).toBe(0.8);
    expect(comparisonAspect(landscape, portrait, 'contain')).toBe(0.8);
    expect(comparisonAspect(landscape, { ...landscape, id: 7 }, 'cover')).toBe(1.5);
  });
  it('lets the photographs size the frame when their dimensions are unknown', () => {
    expect(comparisonAspect({ url: '/a.jpg', alt: '' }, { url: '/b.jpg', alt: '' }, 'cover')).toBeUndefined();
    expect(comparisonAspect({ url: '/a.jpg', alt: '' }, portrait, 'cover')).toBe(0.8);
  });
  it('defaults an unknown fit to cropping and reads only the two supported values', () => {
    expect([undefined, '', 'stretch', 'contain', 'cover'].map(normalizeFit)).toEqual(['cover', 'cover', 'cover', 'contain', 'cover']);
  });
  it('prints one credit for one photographer and names two', () => {
    const labels = { before: 'Before', after: 'After' };
    expect(comparisonCredit({}, labels)).toBe('');
    expect(comparisonCredit({ before: 'Maya', after: 'Maya' }, labels)).toBe('Photo: Maya');
    expect(comparisonCredit({ after: 'Jamal' }, labels)).toBe('Photo: Jamal');
    expect(comparisonCredit({ before: 'Maya', after: 'Jamal' }, { before: '2019', after: '2026' })).toBe('Photo: Maya (2019), Jamal (2026)');
  });
});

describe('before / after saved markup', () => {
  const dom = (attributes: any) => { const root = document.createElement('div'); root.innerHTML = serialize(createBlock('byline/before-after', attributes)); return root; };

  it('lists Before then After, labelled, with the fit and frame shape the stylesheet needs', () => {
    const root = dom({ before: landscape, after: portrait, fit: 'contain', caption: 'The room.' });
    const figure = root.querySelector('figure')!;
    expect(figure.getAttribute('data-fit')).toBe('contain');
    expect(Array.from(root.querySelectorAll('.byline-comparison-image > strong'), (label) => [label.textContent, label.hasAttribute('data-before'), label.hasAttribute('data-after')])).toEqual([['Before', true, false], ['After', false, true]]);
    expect(root.querySelector<HTMLElement>('.byline-comparison-images')!.style.getPropertyValue('--comparison-aspect')).toBe('0.8');
    expect(root.querySelector('figcaption')!.textContent).toBe('The room.');
  });
  it('writes the crop choice explicitly, so a missing choice can only mean older content', () => {
    expect(dom({ before: landscape, after: landscape }).querySelector('figure')!.getAttribute('data-fit')).toBe('cover');
  });
  it('prints no editor instruction, baked-in candidates or credit', () => {
    const root = dom({ before: { ...landscape, srcSet: '/a.jpg 1w', sizes: '100vw', credit: 'Maya' }, after: undefined });
    expect(root.textContent).not.toContain('Choose both photographs');
    expect(root.querySelectorAll('img')).toHaveLength(1);
    expect(root.querySelector('img')!.hasAttribute('srcset')).toBe(false);
    expect(root.querySelector('figcaption')).toBeNull();
  });
});

describe('0.3.24 before / after content migrates', () => {
  it('keeps photographs of different shapes complete rather than cropping what was published whole, and validates', () => {
    const read = (name: string) => parse(readFileSync(resolve(process.cwd(), '../tests/fixtures/storytelling', name), 'utf8')).filter((item: any) => item.name === 'byline/before-after');
    const [same] = read('legacy-0.3.24-lunch-squeeze.html');
    expect(same.isValid).toBe(true);
    expect(same.attributes.fit).toBe('cover');
    expect(same.attributes.before.srcSet).toBeUndefined();
    expect(same.attributes.after.credit).toBeUndefined();
    const edge = read('legacy-0.3.24-edge-cases.html');
    expect(edge.every((item: any) => item.isValid)).toBe(true);
    const different = edge.find((item: any) => item.attributes.before?.url && item.attributes.after?.url && item.attributes.after.height !== item.attributes.before.height);
    expect(different?.attributes.fit).toBe('contain');
    expect(serialize(same)).not.toContain('srcset');
  });
});

describe('comparison enhancer', () => {
  const figure = (before = 'Before', after = 'After') => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = `<figure class="byline-before-after"><div class="byline-comparison-images"><div class="byline-comparison-image"><strong data-before>${before}</strong><img src="/b.jpg" alt=""></div><div class="byline-comparison-image"><strong data-after>${after}</strong><img src="/a.jpg" alt=""></div></div></figure>`;
    return root.querySelector<HTMLElement>('figure')!;
  };
  it('reports the divider position as Before then After, left to right', () => {
    expect(comparisonState(50, 'Before', 'After')).toEqual({ position: '50%', ratio: '0.5', valueText: '50% Before, 50% After' });
    expect(comparisonState(0, '2019', '2026').valueText).toBe('0% 2019, 100% 2026');
    expect(comparisonState(100, '2019', '2026').valueText).toBe('100% 2019, 0% 2026');
  });
  it('labels the photographs in reading order, Before on the left, and names the control from the labels', () => {
    const element = figure('2019', '2026');
    const controller = new AbortController();
    const undo = enhanceBeforeAfter(element, controller.signal)!;
    expect(Array.from(element.querySelectorAll('.byline-comparison-labels > span'), (chip) => chip.textContent)).toEqual(['2019', '2026']);
    const range = element.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(range.getAttribute('aria-label')).toBe('Compare 2019 and 2026');
    range.value = '25'; range.dispatchEvent(new Event('input'));
    expect(range.getAttribute('aria-valuetext')).toBe('25% 2019, 75% 2026');
    expect(element.style.getPropertyValue('--comparison-ratio')).toBe('0.25');
    controller.abort(); undo();
    expect(element.querySelector('input')).toBeNull();
    expect(element.querySelector('.byline-comparison-labels')).toBeNull();
  });
});
