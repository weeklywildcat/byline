// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCROLLY_ACTIVATION_LINE, enhanceArticleStory } from '../../packages/ui/src/article-enhancements';
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
    expect(range.getAttribute('aria-valuetext')).toBe('50% after image revealed');
    expect(root.querySelector('.byline-comparison-divider')!.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.byline-comparison-labels')!.textContent).toBe('BeforeAfter');
    const figure = root.querySelector<HTMLElement>('figure')!;
    expect(figure.style.getPropertyValue('--comparison-position')).toBe('50%');
    range.value = '72'; range.dispatchEvent(new Event('input'));
    expect(figure.style.getPropertyValue('--comparison-position')).toBe('72%');
    expect(figure.style.getPropertyValue('--comparison-ratio')).toBe('0.72');
    expect(range.getAttribute('aria-valuetext')).toBe('72% after image revealed');
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

describe('scrollytelling activation', () => {
  type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
  const observers: { callback: Callback; options: IntersectionObserverInit; observed: Element[]; disconnected: boolean }[] = [];
  beforeEach(() => {
    observers.length = 0;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn() })) });
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: class {
      record: (typeof observers)[number];
      constructor(callback: Callback, options: IntersectionObserverInit) { this.record = { callback, options, observed: [], disconnected: false }; observers.push(this.record); }
      observe(element: Element) { this.record.observed.push(element); }
      disconnect() { this.record.disconnected = true; }
    } });
  });
  const story = '<section class="byline-scrolly">' + [1, 2, 3].map((i) => `<section class="byline-scrolly-step"><figure class="byline-scrolly-media"><img src="/step-${i}.jpg" alt=""><figcaption>Scene ${i}<p>Photo: Staff</p></figcaption></figure><div class="byline-scrolly-text"><h2>Step ${i}</h2></div></section>`).join('') + '</section>';

  it('observes a thin band at the reading line and follows the step covering it', () => {
    const root = document.createElement('div'); document.body.append(root); root.innerHTML = story;
    const cleanup = enhanceArticleStory(root);
    const stage = root.querySelector<HTMLElement>('.byline-scrolly-stage')!;
    expect(stage.dataset.step).toBe('0');
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(stage.querySelector('p')!.textContent).toBe('Scene 1 Photo: Staff');
    const [observer] = observers;
    expect(observer.observed).toHaveLength(3);
    // A fixed band 40% down the viewport, 1% tall, measured against this document.
    expect(observer.options).toMatchObject({ rootMargin: '-40% 0px -59% 0px', threshold: 0, root: document });
    expect(stage.dataset.activationLine).toBe(String(SCROLLY_ACTIVATION_LINE));
    const steps = Array.from(root.querySelectorAll('.byline-scrolly-step'));
    // Entering the band selects the step whatever its visible area; leaving it changes nothing.
    observer.callback([{ target: steps[1], isIntersecting: true, intersectionRatio: 0.01 }]);
    expect([stage.dataset.step, stage.querySelector('img')!.getAttribute('src')]).toEqual(['1', '/step-2.jpg']);
    observer.callback([{ target: steps[1], isIntersecting: false }]);
    expect(stage.dataset.step).toBe('1');
    // A long jump may report several entering steps; the furthest wins, and upward travel reverses.
    observer.callback([{ target: steps[0], isIntersecting: true }, { target: steps[2], isIntersecting: true }]);
    expect(stage.dataset.step).toBe('2');
    observer.callback([{ target: steps[0], isIntersecting: true }]);
    expect(stage.dataset.step).toBe('0');
    // The source story is untouched.
    expect(root.querySelectorAll('.byline-scrolly-step img')).toHaveLength(3);
    cleanup();
    expect(observer.disconnected).toBe(true);
    expect(root.querySelector('.byline-scrolly-stage')).toBeNull();
    expect(root.querySelector('.byline-scrolly')!.classList.contains('is-enhanced')).toBe(false);
  });
  it('stays linear when the media query does not match or a step has no image', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })) });
    const root = document.createElement('div'); document.body.append(root); root.innerHTML = story;
    enhanceArticleStory(root)();
    expect(observers).toHaveLength(0);
    expect(root.querySelector('.byline-scrolly-stage')).toBeNull();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn() })) });
    root.innerHTML = story.replace('<img src="/step-2.jpg" alt="">', '');
    enhanceArticleStory(root)();
    expect(root.querySelector('.byline-scrolly-stage')).toBeNull();
  });
});
