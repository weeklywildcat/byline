// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enhanceArticleStory } from '../../packages/ui/src/article-enhancements';
beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })) });
});
describe('shared article enhancement lifecycle', () => {
  it('is idempotent and cleanup restores the linear comparison before remount', () => {
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = '<figure class="byline-before-after"><div class="byline-comparison-images"><div class="byline-comparison-image"><strong data-before>Before</strong><img src="/before.jpg" alt="Before plan"></div><div class="byline-comparison-image"><strong data-after>After</strong><img src="/after.jpg" alt="After plan"></div></div></figure>';
    const cleanup = enhanceArticleStory(root);
    expect(enhanceArticleStory(root)).toBe(cleanup);
    expect(root.querySelectorAll('input')).toHaveLength(1);
    const range = root.querySelector('input')!;
    expect(range.value).toBe('50'); range.value = '72'; range.dispatchEvent(new Event('input'));
    expect(root.querySelector<HTMLElement>('figure')!.style.getPropertyValue('--comparison-position')).toBe('72%');
    cleanup(); expect(root.querySelector('input')).toBeNull(); expect(root.querySelectorAll('img')).toHaveLength(2);
    enhanceArticleStory(root)(); expect(root.querySelector('input')).toBeNull();
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
});
