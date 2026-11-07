// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { createBlock, getBlockType, parse, registerBlockType, serialize, validateBlock } from '@wordpress/blocks';
import { addEvent, duplicateEvent, isStub, labelYear, moveEvent, periodStarts, removeEvent, setCurrentEvent, MAX_TIMELINE_ITEMS, type TimelineItem } from '../src/blocks/timeline/items';

// The same CJS instance @wordpress/blocks uses, so the filter reaches its validation (see legacy-story-markup.test.ts).
const { addFilter } = createRequire(createRequire(import.meta.url).resolve('@wordpress/blocks'))('@wordpress/hooks');
const corpus = ['legacy-0.3.24-lunch-squeeze.html', 'legacy-0.3.24-edge-cases.html'].map((name) => readFileSync(resolve(process.cwd(), '../tests/fixtures/storytelling', name), 'utf8'));

let ready: Promise<void> | undefined;
function register() {
  ready ??= (async () => {
    addFilter('blocks.getSaveContent.extraProps', 'byline-test/timeline-wrapper', (props: any, blockType: any, attributes: any) => {
      const generated = `wp-block-${blockType.name.replace(/^core\//, '').replace('/', '-')}`;
      const classes = [props.className, generated, attributes.align && `align${attributes.align}`].filter(Boolean);
      return { ...props, className: Array.from(new Set(classes.join(' ').split(' '))).join(' ') };
    });
    await import('../src/blocks/timeline/index');
    for (const name of ['core/paragraph', 'core/heading']) {
      if (!getBlockType(name)) registerBlockType(name, { apiVersion: 3, title: name, category: 'text', attributes: { content: { type: 'string', source: 'html' }, level: { type: 'number' }, placeholder: { type: 'string' } }, save: () => null } as any);
    }
  })();
  return ready;
}
const walk = (blocks: any[]): any[] => blocks.flatMap((block) => [block, ...walk(block.innerBlocks || [])]);
const ours = (markup: string) => walk(parse(markup)).filter((block) => block.name === 'byline/timeline');

// Loading the WordPress component graph is setup, outside each assertion's timeout.
beforeAll(register, 30_000);

describe('saved Timeline content from Byline 0.3.24 still validates', () => {
  it.each(corpus.map((markup, i) => [i, markup] as const))('corpus %i', async (_i, markup) => {
    await register();
    const blocks = ours(markup);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.filter((block) => !block.isValid).map((block) => block.name)).toEqual([]);
  });

  it('keeps the sample events of an untouched 0.3.24 Timeline and gives new ones empty events', async () => {
    await register();
    const sample = ours(corpus[1]).filter((block) => block.name === 'byline/timeline');
    const legacy = sample.find((block) => block.attributes.items.some((item: TimelineItem) => item.title === 'How it began'))!;
    expect(legacy.attributes.items).toHaveLength(2);
    expect(legacy.isValid).toBe(true);
    const fresh = createBlock('byline/timeline');
    expect(fresh.attributes.items).toEqual([{ label: '', title: '', body: '' }, { label: '', title: '', body: '' }]);
    const [reopened] = parse(serialize(fresh));
    expect(validateBlock(reopened)[0]).toBe(true);
  });
});

describe('Timeline events', () => {
  const event = (label: string, title = 'Title', body = ''): TimelineItem => ({ label, title, body });
  const items = [event('A'), event('B'), event('C')];

  it('adds, duplicates and removes without mutating the input, and tells focus where to go', () => {
    expect(addEvent(items, 1)).toEqual({ items: [items[0], { label: '', title: '', body: '' }, items[1], items[2]], focusIndex: 1 });
    expect(addEvent(items).focusIndex).toBe(3);
    expect(duplicateEvent(items, 1)).toEqual({ items: [items[0], items[1], items[1], items[2]], focusIndex: 2 });
    expect(removeEvent(items, 2)).toEqual({ items: [items[0], items[1]], focusIndex: 1 });
    expect(removeEvent(items, 0).focusIndex).toBe(0);
    expect(removeEvent([items[0]], 0)).toEqual({ items: [{ label: '', title: '', body: '' }], focusIndex: 0 });
    expect(items).toHaveLength(3);
  });
  it('stops at 25 events', () => {
    const full = Array.from({ length: MAX_TIMELINE_ITEMS }, () => event('x'));
    expect(addEvent(full).items).toBe(full);
    expect(duplicateEvent(full, 0).items).toBe(full);
  });
  it('moves events and reports where they went; the ends do nothing', () => {
    expect(moveEvent(items, 0, 1)).toEqual({ items: [items[1], items[0], items[2]], focusIndex: 1 });
    expect(moveEvent(items, 2, -1)).toEqual({ items: [items[0], items[2], items[1]], focusIndex: 1 });
    expect(moveEvent(items, 0, -1).items).toBe(items);
    expect(moveEvent(items, 2, 1).items).toBe(items);
  });
  it('marks one latest event; a copy is never the latest', () => {
    const marked = setCurrentEvent(items, 1, true);
    expect(marked.map((item) => Boolean(item.current))).toEqual([false, true, false]);
    expect(setCurrentEvent(marked, 2, true).map((item) => Boolean(item.current))).toEqual([false, false, true]);
    expect(setCurrentEvent(marked, 1, false).some((item) => item.current)).toBe(false);
    expect(duplicateEvent(marked, 1).items[2]).not.toHaveProperty('current');
  });
  it('knows a stub from an event and finds the years the page notes', () => {
    expect(isStub(event('Oct. 8', '', ''))).toBe(true);
    expect(isStub(event('', '', '<strong> </strong>'))).toBe(true);
    expect(isStub(event('', '', 'Reporting'))).toBe(false);
    expect(labelYear('Fall 2027')).toBe('2027');
    expect(labelYear('Oct. 17, 2026')).toBe('2026');
    expect(labelYear('Room 1204')).toBeNull();
    expect(labelYear('June 12')).toBeNull();
    expect(periodStarts([event('Fall 2026'), event('Oct. 8'), event('Jan. 5, 2027'), event('2027'), event('', 'No label'), event('Spring 2028'), event('Dec 2029', '')])).toEqual([false, false, true, false, false, true, false]);
  });
  it('saves a latest event with a class and nothing else about it', async () => {
    await register();
    const html = serialize(createBlock('byline/timeline', { items: [event('Oct. 8', 'Meeting'), { ...event('Now', 'Latest', 'The newest reporting.'), current: true }] }));
    expect(html.match(/<li class="byline-timeline-item is-current">/g)).toHaveLength(1);
    expect(html.match(/<li class="byline-timeline-item">/g)).toHaveLength(1);
    const [parsed] = parse(html);
    expect(validateBlock(parsed)[0]).toBe(true);
    expect(parsed.attributes.items[1].current).toBe(true);
  });
});
