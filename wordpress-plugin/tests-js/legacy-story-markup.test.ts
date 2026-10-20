// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getBlockType, parse, registerBlockType } from '@wordpress/blocks';
import { createRequire } from 'node:module';
// Same CJS instance @wordpress/blocks uses (see vitest.config.mts), so the filter reaches its validation.
const { addFilter } = createRequire(createRequire(import.meta.url).resolve('@wordpress/blocks'))('@wordpress/hooks');

/**
 * Compatibility corpus: block markup exactly as Byline 0.3.24 saved it. Every
 * Byline story block in it must still parse as valid (directly or through a
 * `deprecated` migration), so already-published and already-drafted articles
 * never show "This block contains unexpected or invalid content".
 */
const corpus = ['legacy-0.3.24-lunch-squeeze.html', 'legacy-0.3.24-edge-cases.html'].map((name) => [name, readFileSync(resolve(process.cwd(), '../tests/fixtures/storytelling', name), 'utf8')] as const);

/** The wrapper classes block-editor adds when saving (generated class name and alignment). */
let hooked = false;
function saveTimeHooks() {
  if (hooked) return;
  hooked = true;
  addFilter('blocks.getSaveContent.extraProps', 'byline-test/wrapper', (props: any, blockType: any, attributes: any) => {
    const generated = `wp-block-${blockType.name.replace(/^core\//, '').replace('/', '-')}`;
    const classes = [props.className, generated, attributes.align && `align${attributes.align}`].filter(Boolean);
    return { ...props, className: Array.from(new Set(classes.join(' ').split(' '))).join(' ') };
  });
}

async function registerStoryBlocks() {
  saveTimeHooks();
  // Importing a block module registers it with its real save() and deprecations.
  for (const slug of ['annotated-image', 'before-after', 'scrolly', 'scrolly-step', 'timeline', 'visualization']) {
    await import(`../src/blocks/${slug}/index.tsx`);
  }
  for (const name of ['core/paragraph', 'core/heading', 'core/image', 'core/pullquote', 'core/group', 'core/gallery']) {
    if (!getBlockType(name)) registerBlockType(name, { apiVersion: 3, title: name, category: 'text', attributes: { content: { type: 'string', source: 'html' }, level: { type: 'number' }, tagName: { type: 'string' }, className: { type: 'string' }, align: { type: 'string' } }, save: () => null } as any);
  }
}

const walk = (blocks: any[]): any[] => blocks.flatMap((block) => [block, ...walk(block.innerBlocks || [])]);

// Loading the WordPress component graph is setup, outside each assertion's timeout.
beforeAll(registerStoryBlocks, 30_000);

describe('Byline 0.3.24 saved story markup still validates', () => {
  it.each(corpus)('%s', async (_name, markup) => {
    await registerStoryBlocks();
    const story = walk(parse(markup)).filter((block) => block.name.startsWith('byline/'));
    expect(story.length).toBeGreaterThan(5);
    const invalid = story.filter((block) => !block.isValid).map((block) => `${block.name}: ${JSON.stringify(block.validationIssues?.map((issue: any) => issue.args?.slice(0, 4)))}`);
    expect(invalid).toEqual([]);
    expect(story.filter((block) => block.name === 'core/missing')).toEqual([]);
  });
});
