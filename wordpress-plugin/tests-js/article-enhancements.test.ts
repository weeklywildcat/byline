// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enhanceArticleStory } from '../../packages/ui/src/article-enhancements';
beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })) });
});
const comparison = '<figure class="byline-before-after"><div class="byline-comparison-images"><div class="byline-comparison-image"><strong data-before>Before</strong><img src="/before.jpg" alt="Before plan"></div><div class="byline-comparison-image"><strong data-after>After</strong><img src="/after.jpg" alt="After plan"></div></div><figcaption>Caption</figcaption></figure>';
describe('shared article enhancement lifecycle', () => {
  it('is idempotent and cleanup restores the linear comparison before remount', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = comparison;
    const before = root.innerHTML;
    const cleanup = enhanceArticleStory(root);
    expect(enhanceArticleStory(root)).toBe(cleanup);
    // One native range, laid over the photographs inside the comparison frame; no control below it.
    const ranges = root.querySelectorAll('input');
    expect(ranges).toHaveLength(1);
    const range = ranges[0];
    expect(range.type).toBe('range');
    expect(range.parentElement!.classList.contains('byline-comparison-images')).toBe(true);
    expect(root.querySelector('.byline-comparison-control')).toBeNull();
    expect([range.min, range.max, range.value]).toEqual(['0', '100', '50']);
    expect(range.getAttribute('aria-label')).toBe('Compare Before and After');
    expect(range.getAttribute('aria-valuetext')).toBe('50% Before, 50% After');
    expect(root.querySelector('.byline-comparison-divider')!.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.byline-comparison-labels')!.textContent).toBe('BeforeAfter');
    const figure = root.querySelector<HTMLElement>('figure')!;
    expect(figure.style.getPropertyValue('--comparison-position')).toBe('50%');
    range.value = '72'; range.dispatchEvent(new Event('input'));
    expect(figure.style.getPropertyValue('--comparison-position')).toBe('72%');
    expect(figure.style.getPropertyValue('--comparison-ratio')).toBe('0.72');
    expect(range.getAttribute('aria-valuetext')).toBe('72% Before, 28% After');
    cleanup();
    expect(root.querySelector('input')).toBeNull();
    expect(figure.getAttribute('style')).toBeNull();
    expect(root.innerHTML).toBe(before);
    expect(root.querySelectorAll('img')).toHaveLength(2);
    enhanceArticleStory(root)(); expect(root.querySelector('input')).toBeNull();
  });
  it('uses custom Before/After labels for the accessible name', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = comparison.replace('>Before<', '>2019<').replace('>After<', '>2026<');
    enhanceArticleStory(root)();
    root.innerHTML = comparison.replace('>Before<', '>2019<').replace('>After<', '>2026<');
    const cleanup = enhanceArticleStory(root);
    expect(root.querySelector('input')!.getAttribute('aria-label')).toBe('Compare 2019 and 2026');
    cleanup();
  });
  it('validates saved provider claims again, skips static and private preview frames', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = '<figure class="byline-visualization" data-mode="embed" data-provider="datawrapper" data-src="https://evil.example/AbCdE/1/"><div class="byline-visualization-media"></div></figure><figure class="byline-visualization" data-mode="static" data-provider="datawrapper" data-src="https://datawrapper.dwcdn.net/AbCdE/1/"><div class="byline-visualization-media"></div></figure>';
    enhanceArticleStory(root)(); expect(root.querySelector('iframe')).toBeNull();
    root.innerHTML = '<figure class="byline-visualization" data-mode="embed" data-provider="datawrapper" data-src="https://datawrapper.dwcdn.net/AbCdE/1/"><h2>District budget</h2><div class="byline-visualization-media"></div></figure>';
    enhanceArticleStory(root, { preview: true })(); expect(root.querySelector('iframe')).toBeNull();
    const cleanup = enhanceArticleStory(root); const frame = root.querySelector('iframe')!;
    expect(frame.title).toBe('District budget'); expect(frame.loading).toBe('lazy'); expect(frame.getAttribute('sandbox')).toContain('allow-scripts'); cleanup();
  });
  it('labels the fallback as a preview, never loads a provider, and removes its labels on cleanup', () => {
    const root = document.createElement('div'); document.body.append(root);
    const figure = (image: string) => `<figure class="byline-visualization" data-mode="embed" data-provider="openstreetmap" data-src="https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4"><h3 class="byline-visualization-title">Map</h3><div class="byline-visualization-media"><div class="byline-visualization-fallback-image">${image}</div></div></figure>`;
    root.innerHTML = figure('<img src="/fallback.png" alt="">');
    const cleanup = enhanceArticleStory(root, { preview: true });
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.querySelector('.byline-visualization-badge')!.textContent).toBe('Preview: interactive OpenStreetMap map loads here on the published story');
    expect(root.querySelector('.byline-visualization-placeholder')).toBeNull();
    cleanup();
    expect(root.querySelector('.byline-visualization-badge')).toBeNull();
    root.innerHTML = figure('');
    enhanceArticleStory(root, { preview: true });
    expect(root.querySelector('.byline-visualization-placeholder')!.textContent).toBe('OpenStreetMap map');
  });
  it('keeps the fallback until the frame loads, then reserves nothing more', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = '<figure class="byline-visualization" data-mode="embed" data-provider="datawrapper" data-src="https://datawrapper.dwcdn.net/AbCdE/1/"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"><img src="/f.png" alt=""></div></div></figure>';
    enhanceArticleStory(root);
    const fallback = root.querySelector<HTMLElement>('.byline-visualization-fallback-image')!;
    const media = root.querySelector<HTMLElement>('.byline-visualization-media')!;
    expect(fallback.hidden).toBe(false);
    root.querySelector('iframe')!.dispatchEvent(new Event('load'));
    expect(fallback.hidden).toBe(true);
    expect(media.classList.contains('is-loaded')).toBe(true);
  });
  it('uses the preview iframe realm and keeps incomplete comparisons linear', () => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const doc = frame.contentDocument!;
    Object.defineProperty(doc.defaultView!, 'matchMedia', { value: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })) });
    const root = doc.createElement('div'); doc.body.append(root);
    root.innerHTML = '<figure class="byline-before-after"><div class="byline-comparison-images"><div class="byline-comparison-image"><img src="/one.jpg" alt="One image"></div></div></figure>';
    expect(() => enhanceArticleStory(root, { preview: true })()).not.toThrow();
    expect(root.querySelector('input')).toBeNull();
  });
  it('never builds a frame for look-alike Google hosts, but does for the real embed endpoint', () => {
    const figure = (src: string) => `<figure class="byline-visualization" data-mode="embed" data-provider="google-maps" data-src="${src}"><h2>District map</h2><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"><img src="/fallback.png" alt=""></div></div></figure>`;
    const root = document.createElement('div'); document.body.append(root);
    for (const src of ['https://www.google.com.evil.example/maps/embed?pb=x', 'https://evil.example/maps/embed?pb=x', 'http://www.google.com/maps/embed?pb=x', 'https://www.google.com/maps/embed', 'https://www.google.com/search?pb=x']) {
      root.innerHTML = figure(src);
      enhanceArticleStory(root)();
      expect(root.querySelector('iframe'), src).toBeNull();
    }
    root.innerHTML = figure('https://www.google.com/maps/embed?pb=!1m18').replace('<h2>District map</h2>', '<h2>District map</h2>').replace('data-mode="embed"', 'data-mode="embed" data-height="compact"');
    const cleanup = enhanceArticleStory(root);
    const frame = root.querySelector('iframe')!;
    expect(frame.src).toBe('https://www.google.com/maps/embed?pb=!1m18');
    expect(frame.title).toBe('District map');
    expect(frame.style.height).toBe('320px');
    cleanup();
    expect(root.querySelector('iframe')).toBeNull();
  });
});
