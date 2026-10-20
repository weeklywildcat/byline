// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('scrollytelling activation', () => {
  type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
  const observers: { callback: Callback; options: IntersectionObserverInit; observed: Element[]; disconnected: boolean }[] = [];
  beforeEach(() => {
    observers.length = 0;
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn() })) });
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: class {
      record: (typeof observers)[number];
      constructor(callback: Callback, options: IntersectionObserverInit) { this.record = { callback, options, observed: [], disconnected: false }; observers.push(this.record); }
      observe(element: Element) { this.record.observed.push(element); }
      disconnect() { this.record.disconnected = true; }
    } });
  });
  afterEach(() => vi.useRealTimers());
  const step = (i: number, photo = true, size = '') => `<section class="byline-scrolly-step">${photo ? `<figure class="byline-scrolly-media"><img src="/step-${i}.jpg" alt=""${size}><figcaption>Scene ${i}<p class="photo-credit">Photo: Staff</p></figcaption></figure>` : ''}<div class="byline-scrolly-text"><h2>Step ${i}</h2></div></section>`;
  const story = '<section class="byline-scrolly" data-fit="contain">' + [1, 2, 3].map((i) => step(i)).join('') + '</section>';
  /** The photograph the stage shows now: the newest frame (an outgoing one may still be fading). */
  const shown = (root: Element) => root.querySelector<HTMLElement>('.byline-scrolly-frame:last-child')!;

  it('observes a thin band at the reading line and follows the step covering it', () => {
    const root = document.createElement('div'); document.body.append(root); root.innerHTML = story;
    const cleanup = enhanceArticleStory(root);
    const stage = root.querySelector<HTMLElement>('.byline-scrolly-stage')!;
    expect(stage.dataset.step).toBe('0');
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(stage.dataset.fit).toBe('contain');
    expect(stage.querySelector('.byline-scrolly-progress')!.textContent).toBe('Step 1 of 3');
    // Caption and credit stay on separate lines, as in the figure language.
    expect(shown(stage).querySelector('figcaption')!.firstChild!.textContent).toBe('Scene 1');
    expect(shown(stage).querySelector('figcaption .photo-credit')!.textContent).toBe('Photo: Staff');
    const [observer] = observers;
    expect(observer.observed).toHaveLength(3);
    // A fixed band 40% down the viewport, 1% tall, measured against this document.
    expect(observer.options).toMatchObject({ rootMargin: '-40% 0px -59% 0px', threshold: 0, root: document });
    expect(stage.dataset.activationLine).toBe(String(SCROLLY_ACTIVATION_LINE));
    const steps = Array.from(root.querySelectorAll('.byline-scrolly-step'));
    // Entering the band selects the step whatever its visible area; leaving it changes nothing.
    observer.callback([{ target: steps[1], isIntersecting: true, intersectionRatio: 0.01 }]);
    expect([stage.dataset.step, shown(stage).querySelector('img')!.getAttribute('src')]).toEqual(['1', '/step-2.jpg']);
    expect(stage.querySelector('.byline-scrolly-progress')!.textContent).toBe('Step 2 of 3');
    expect(Array.from(stage.querySelectorAll('.byline-scrolly-ticks i')).map((tick) => tick.className)).toEqual(['is-past', 'is-active', '']);
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

  it('crossfades: the outgoing photograph leaves while the new one arrives, then only the new one remains', () => {
    const root = document.createElement('div'); document.body.append(root); root.innerHTML = story;
    enhanceArticleStory(root);
    const stage = root.querySelector<HTMLElement>('.byline-scrolly-stage')!;
    // The first photograph is simply there.
    expect(stage.querySelectorAll('.byline-scrolly-frame')).toHaveLength(1);
    expect(stage.querySelector('.byline-scrolly-frame')!.classList.contains('is-entering')).toBe(false);
    observers[0].callback([{ target: root.querySelectorAll('.byline-scrolly-step')[1], isIntersecting: true }]);
    const frames = stage.querySelectorAll('.byline-scrolly-frame');
    expect(Array.from(frames, (frame) => frame.className)).toEqual(['byline-scrolly-frame is-leaving', 'byline-scrolly-frame is-entering']);
    vi.advanceTimersByTime(30);
    expect(frames[1].classList.contains('is-entering')).toBe(false);
    vi.advanceTimersByTime(500);
    expect(stage.querySelectorAll('.byline-scrolly-frame')).toHaveLength(1);
    expect(shown(stage).querySelector('img')!.getAttribute('src')).toBe('/step-2.jpg');
  });

  it('holds the previous photograph through a text-only step and starts on the first photograph', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = '<section class="byline-scrolly">' + [step(1), step(2, false), step(3)].join('') + '</section>';
    enhanceArticleStory(root);
    const stage = root.querySelector<HTMLElement>('.byline-scrolly-stage')!;
    const steps = Array.from(root.querySelectorAll('.byline-scrolly-step'));
    observers[0].callback([{ target: steps[1], isIntersecting: true }]);
    expect(stage.dataset.step).toBe('1');
    expect(stage.querySelectorAll('.byline-scrolly-frame')).toHaveLength(1);
    expect(shown(stage).querySelector('img')!.getAttribute('src')).toBe('/step-1.jpg');
    expect(stage.querySelector('.byline-scrolly-progress')!.textContent).toBe('Step 2 of 3');
    observers[0].callback([{ target: steps[2], isIntersecting: true }]);
    expect(shown(stage).querySelector('img')!.getAttribute('src')).toBe('/step-3.jpg');
    // A story that opens with a text-only step starts on the first photograph.
    const opening = document.createElement('div'); document.body.append(opening);
    opening.innerHTML = '<section class="byline-scrolly">' + [step(1, false), step(2)].join('') + '</section>';
    enhanceArticleStory(opening);
    expect(shown(opening.querySelector('.byline-scrolly-stage')!).querySelector('img')!.getAttribute('src')).toBe('/step-2.jpg');
  });

  it('gives a story of mostly portrait photographs a narrower-text layout class, and removes it on cleanup', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = '<section class="byline-scrolly">' + [1, 2, 3].map((i) => step(i, true, i < 3 ? ' width="1600" height="2000"' : ' width="1600" height="1067"')).join('') + '</section>';
    const cleanup = enhanceArticleStory(root);
    const element = root.querySelector('.byline-scrolly')!;
    expect(element.classList.contains('is-portrait')).toBe(true);
    cleanup();
    expect(element.classList.contains('is-portrait')).toBe(false);
    const landscape = document.createElement('div'); document.body.append(landscape);
    landscape.innerHTML = '<section class="byline-scrolly">' + [1, 2].map((i) => step(i, true, ' width="1600" height="1067"')).join('') + '</section>';
    enhanceArticleStory(landscape);
    expect(landscape.querySelector('.byline-scrolly')!.classList.contains('is-portrait')).toBe(false);
  });

  it('stays linear when the media query does not match or no step has a photograph', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })) });
    const root = document.createElement('div'); document.body.append(root); root.innerHTML = story;
    enhanceArticleStory(root)();
    expect(observers).toHaveLength(0);
    expect(root.querySelector('.byline-scrolly-stage')).toBeNull();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn() })) });
    root.innerHTML = '<section class="byline-scrolly">' + [1, 2].map((i) => step(i, false)).join('') + '</section>';
    enhanceArticleStory(root)();
    expect(root.querySelector('.byline-scrolly-stage')).toBeNull();
  });
});
