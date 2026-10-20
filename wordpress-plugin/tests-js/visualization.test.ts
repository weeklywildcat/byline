// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { getBlockType, parse, serialize } from '@wordpress/blocks';
const { addFilter } = createRequire(createRequire(import.meta.url).resolve('@wordpress/blocks'))('@wordpress/hooks');
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { visualizationUrl, visualizationHeight, visualizationHeights, visualizationMessageHeight, visualizationPieceName, visualizationPreviewNote } from '../../packages/ui/src/visualization';
import { diagnoseEmbedInput, embedAttributes, embedProblem, heightChoices, setupGaps } from '../src/blocks/visualization/model';
describe('visualization provider boundary', () => {
  it('normalizes only supported HTTPS share/embed forms', () => {
    expect(visualizationUrl('https://www.datawrapper.de/_/AbCdE/')).toEqual({ provider: 'datawrapper', src: 'https://datawrapper.dwcdn.net/AbCdE/', id: 'AbCdE' });
    expect(visualizationUrl('https://datawrapper.dwcdn.net/AbCdE/2/')).toMatchObject({ id: 'AbCdE' });
    expect(visualizationUrl('https://public.flourish.studio/visualisation/1234/')).toEqual({ provider: 'flourish', src: 'https://flo.uri.sh/visualisation/1234/embed?auto=1', id: '1234' });
    expect(visualizationUrl('https://flo.uri.sh/story/42/embed')).toMatchObject({ provider: 'flourish' });
    expect(visualizationUrl('https://www.google.com/maps/embed?pb=example')).toMatchObject({ provider: 'google-maps' });
    expect(visualizationUrl('https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4')).toMatchObject({ provider: 'openstreetmap' });
    for (const input of ['javascript:alert(1)','data:text/html,hello','http://datawrapper.dwcdn.net/AbCdE/','https://datawrapper.dwcdn.net.evil.com/AbCdE/', 'https://evil.com','https://datawrapper.dwcdn.net@evil.com/AbCdE/', 'https://www.google.com/search?q=hello', 'https://flo.uri.sh/evil', 'https://datawrapper.dwcdn.net:444/AbCdE/']) expect(visualizationUrl(input), input).toBeNull();
  });
  it('accepts Google Maps only on its own embed endpoints and rejects look-alike hosts', () => {
    for (const input of ['https://www.google.com/maps/embed?pb=!1m18', 'https://www.google.com/maps/embed/v1/place?key=abc&q=Campus', 'https://maps.google.com/maps/embed?pb=x']) expect(visualizationUrl(input), input).toMatchObject({ provider: 'google-maps', src: input });
    // The saved URL never keeps a fragment.
    expect(visualizationUrl('https://www.google.com/maps/embed?pb=x#frag')!.src).toBe('https://www.google.com/maps/embed?pb=x');
    for (const input of [
      'https://www.google.com.evil.example/maps/embed?pb=x', 'https://maps.google.com.evil.example/maps/embed?pb=x', 'https://evil.example/maps/embed?pb=x',
      'https://www.google.com@evil.example/maps/embed?pb=x', 'https://www.google.com:8443/maps/embed?pb=x', 'http://www.google.com/maps/embed?pb=x',
      'https://google.com/maps/embed?pb=x', 'https://www.google.co.uk/maps/embed?pb=x', 'https://notgoogle.com/maps/embed?pb=x', 'https://www.google.com/maps/embed',
      'https://www.google.com/maps/embed/v1/unknown?key=abc', 'https://www.google.com/maps?pb=x', 'https://www.google.com/maps/d/embed?mid=1', 'https://www.google.com/url?q=https://evil.example&pb=x',
      'https://user:pass@www.google.com/maps/embed?pb=x', 'javascript://www.google.com/maps/embed?pb=x', 'https://www.google.com/maps/embed/../search?pb=x'
    ]) expect(visualizationUrl(input), input).toBeNull();
  });
  it('maps semantic heights and bounds authenticated resize payloads', () => {
    expect(['compact','standard','tall','map','invalid'].map(visualizationHeight)).toEqual([320,480,680,560,480]);
    expect(visualizationMessageHeight({ 'datawrapper-height': { AbCdE: 611 } }, 'datawrapper','AbCdE')).toBe(611);
    expect(visualizationMessageHeight(JSON.stringify({ source: 'Flourish', context: 'iframe.resize', height: 702 }), 'flourish','123')).toBe(702);
    for (const height of [-10,0,2500,Infinity,'500',null]) expect(visualizationMessageHeight({ 'datawrapper-height': { AbCdE: height } }, 'datawrapper','AbCdE')).toBeNull();
    expect(visualizationMessageHeight({ 'datawrapper-height': { other: 600 } }, 'datawrapper','AbCdE')).toBeNull();
    expect(visualizationMessageHeight('bad json', 'flourish','123')).toBeNull();
    expect(visualizationMessageHeight({ source: 'Other', context: 'iframe.resize', height: 600 }, 'flourish','123')).toBeNull();
  });
});

describe('chart / map setup model', () => {
  it('names the recognised provider and normalises share links to the embed form', () => {
    expect(diagnoseEmbedInput('  https://www.datawrapper.de/_/AbCdE/  ')).toEqual({ state: 'accepted', provider: 'datawrapper', label: 'Datawrapper', src: 'https://datawrapper.dwcdn.net/AbCdE/' });
    expect(diagnoseEmbedInput('https://public.flourish.studio/visualisation/1234/')).toMatchObject({ provider: 'flourish', src: 'https://flo.uri.sh/visualisation/1234/embed?auto=1' });
    expect(diagnoseEmbedInput('')).toEqual({ state: 'empty' });
  });
  it('never accepts embed code, plain http or addresses outside the allowlist, and says why', () => {
    const code = '<iframe src="https://datawrapper.dwcdn.net/AbCdE/" width="600"></iframe>';
    expect(diagnoseEmbedInput(code)).toEqual({ state: 'code' });
    expect(diagnoseEmbedInput('src="https://datawrapper.dwcdn.net/AbCdE/"')).toEqual({ state: 'code' });
    expect(diagnoseEmbedInput('http://datawrapper.dwcdn.net/AbCdE/')).toEqual({ state: 'insecure' });
    expect(diagnoseEmbedInput('https://example.com/chart')).toEqual({ state: 'unsupported' });
    expect(diagnoseEmbedInput('javascript:alert(1)')).toEqual({ state: 'unsupported' });
    for (const state of ['code', 'insecure', 'unsupported'] as const) expect(embedProblem({ state })).not.toBe('');
    expect(embedProblem({ state: 'empty' })).toBe('');
  });
  it('turns a default chart into a map for map providers without overriding a writer choice', () => {
    expect(embedAttributes('https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4', { type: 'chart', heightPreset: 'standard' })).toMatchObject({ provider: 'openstreetmap', type: 'map', heightPreset: 'map' });
    expect(embedAttributes('https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4', { type: 'chart', heightPreset: 'tall' })).not.toHaveProperty('type');
    expect(embedAttributes('https://datawrapper.dwcdn.net/AbCdE/', { type: 'chart', heightPreset: 'standard' })).toEqual({ embedUrl: 'https://datawrapper.dwcdn.net/AbCdE/', provider: 'datawrapper' });
    // Typing keeps what was typed; pasting or leaving the field swaps in the embed form.
    expect(embedAttributes('https://www.datawrapper.de/_/AbCdE/', { type: 'chart', heightPreset: 'standard' }).embedUrl).toBe('https://www.datawrapper.de/_/AbCdE/');
    expect(embedAttributes('https://www.datawrapper.de/_/AbCdE/', { type: 'chart', heightPreset: 'standard' }, true).embedUrl).toBe('https://datawrapper.dwcdn.net/AbCdE/');
    expect(embedAttributes('https://evil.example', { type: 'chart', heightPreset: 'standard' }, true)).toEqual({ embedUrl: 'https://evil.example', provider: '' });
  });
  it('lists what is still missing', () => {
    const image = { url: '/a.png', alt: 'A chart' };
    expect(setupGaps({ mode: 'embed', embedUrl: '', image: { url: '', alt: '' } })).toEqual(['address', 'graphic']);
    expect(setupGaps({ mode: 'embed', embedUrl: 'https://datawrapper.dwcdn.net/AbCdE/', image: { url: '/a.png', alt: '' } })).toEqual(['alt']);
    expect(setupGaps({ mode: 'static', embedUrl: '', image })).toEqual([]);
  });
  it('words the preview badge from the provider', () => {
    expect(visualizationPreviewNote('datawrapper')).toBe('interactive Datawrapper chart loads here on the published story');
    expect(visualizationPieceName('openstreetmap')).toBe('OpenStreetMap map');
    expect(visualizationPreviewNote('')).toBe('the interactive chart or map loads here on the published story');
  });
  it('keeps the height presets, the choice list and the public CSS in agreement', () => {
    const css = readFileSync(resolve(__dirname, '../../packages/ui/src/newsroom/visualization.css'), 'utf8');
    for (const [preset, pixels] of Object.entries(visualizationHeights)) {
      const rule = preset === 'standard' ? /\.byline-visualization \{ --viz-height: (\d+)px; \}/ : new RegExp(`data-height="${preset}"\\] \\{ --viz-height: (\\d+)px; \\}`);
      expect(Number(css.match(rule)?.[1]), preset).toBe(pixels);
    }
    expect(heightChoices.map((choice) => [choice.value, choice.pixels])).toEqual(Object.entries(visualizationHeights));
  });
});

describe('saved Chart / Map markup', () => {
  beforeAll(async () => { await import('../src/blocks/visualization/index'); }, 30_000);
  async function blocks(markup: string) {
    addFilter('blocks.getSaveContent.extraProps', 'byline-test/viz-wrapper', (props: any, blockType: any, attributes: any) => ({ ...props, className: Array.from(new Set([props.className, `wp-block-${blockType.name.replace('/', '-')}`, attributes.align && `align${attributes.align}`].filter(Boolean).join(' ').split(' '))).join(' ') }));
    if (!getBlockType('byline/visualization')) await import('../src/blocks/visualization/index');
    return parse(markup);
  }
  const legacy = '<!-- wp:byline/visualization {"title":"Budget","description":"Dollars per student.","embedUrl":"https://datawrapper.dwcdn.net/AbCdE/2/","provider":"datawrapper","source":"District","image":{"id":7,"url":"/a.png","alt":"A chart","width":1600,"height":700,"srcSet":"/a.png 1600w","sizes":"100vw","credit":"Baked"}} -->\n<figure class="wp-block-byline-visualization alignwide byline-visualization" data-mode="embed" data-provider="datawrapper" data-src="https://datawrapper.dwcdn.net/AbCdE/2/" data-height="standard"><h2>Budget</h2><p>Dollars per student.</p><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"><img src="/a.png" alt="A chart" width="1600" height="700" srcset="/a.png 1600w" sizes="100vw" loading="lazy" class="wp-image-7"/></div></div><p class="byline-visualization-link"><a href="https://datawrapper.dwcdn.net/AbCdE/2/" rel="noopener noreferrer">Open visualization: Budget</a></p><figcaption><p>Source: District</p><p>Credit: Baked</p></figcaption></figure>\n<!-- /wp:byline/visualization -->';
  it('migrates 0.3.24 markup to the slim figure, dropping baked-in responsive candidates and credit', async () => {
    const [block] = await blocks(legacy);
    expect(block.isValid).toBe(true);
    expect(block.attributes.image).toEqual({ id: 7, url: '/a.png', alt: 'A chart', width: 1600, height: 700 });
    expect(block.attributes.credit).toBe('');
    const html = serialize(block);
    expect(html).toContain('<h3 class="byline-visualization-title">Budget</h3>');
    expect(html).toContain('Open the interactive version');
    expect(html).not.toMatch(/srcset|Baked/i);
    const [again] = await blocks(html);
    expect(again.isValid).toBe(true);
    expect(serialize(again)).toBe(html);
  });
  it('keeps a credit that has no attachment behind it, as the block\'s own', async () => {
    const [block] = await blocks(legacy.replace('"id":7,', '').replace(' class="wp-image-7"', ''));
    expect(block.attributes.credit).toBe('Baked');
  });
});
