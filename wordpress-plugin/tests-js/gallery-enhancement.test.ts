// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enhanceArticleGalleries } from '../../packages/ui/src/article-enhancements/gallery';
import { enhanceArticleStory } from '../../packages/ui/src/article-enhancements';
import { articleEnhancementSelector } from '../../packages/ui/src/article-enhancements/selector';

/**
 * The shared enhancer is the canonical home of the Photo Gallery lightbox from
 * "Fix Photo Gallery media delivery" (#137). These tests pin that contract.
 */
const base = 'https://cdn.example/uploads';
function photo(name: string, { linked = true, alt = name, full = true, srcset = true }: { linked?: boolean; alt?: string; full?: boolean; srcset?: boolean } = {}) {
  const image = `<img width="1024" height="683" ${full ? `data-byline-full-url="${base}/${name}.jpg"` : ''} src="${base}/${name}-1024x683.jpg" alt="${alt}" ${srcset ? `srcset="${base}/${name}-300x200.jpg 300w, ${base}/${name}-1536x1024.jpg 1536w, ${base}/${name}-768x512.jpg 768w"` : ''}>`;
  return `<figure class="wp-block-image">${linked ? `<a href="${base}/${name}.jpg">${image}</a>` : image}<figcaption>${name} caption</figcaption></figure>`;
}
const gallery = (items: string, className = 'is-style-byline-photo-gallery') => `<figure class="wp-block-gallery ${className}">${items}</figure>`;

function polyfillDialog() {
  const prototype = window.HTMLDialogElement.prototype as any;
  prototype.showModal = function () { this.setAttribute('open', ''); };
  prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
}

let root: HTMLElement;
let created: string[];
beforeEach(() => {
  polyfillDialog();
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.className = 'article-body';
  document.body.append(root);
  created = [];
  vi.spyOn(window, 'Image').mockImplementation(function (this: any) {
    const image = document.createElement('img');
    Object.defineProperty(image, 'src', { set: (value: string) => created.push(value), get: () => '' });
    return image;
  } as any);
});
afterEach(() => { vi.restoreAllMocks(); });

/** Dispatch a click and report whether the enhancer claimed it (jsdom cannot navigate, so the probe cancels it afterwards). */
function claimed(element: Element, init: MouseEventInit = { button: 0 }) {
  let prevented = false;
  const probe = (event: Event) => { prevented = event.defaultPrevented; event.preventDefault(); };
  document.addEventListener('click', probe);
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  document.removeEventListener('click', probe);
  return prevented;
}
const dialog = () => document.querySelector<HTMLDialogElement>('dialog.byline-gallery-dialog');
const shown = () => dialog()!.querySelector('img')!.getAttribute('src');
const settle = () => dialog()!.querySelector('img')!.onload!(new Event('load'));

describe('article enhancement selector', () => {
  it('sees unlinked Photo Gallery images and every interactive block, but not plain text', () => {
    const matches = (html: string) => { root.innerHTML = html; return Boolean(root.querySelector(articleEnhancementSelector)); };
    expect(matches(gallery(photo('a', { linked: false })))).toBe(true);
    expect(matches(gallery(photo('a')))).toBe(true);
    expect(matches('<figure class="byline-before-after"></figure>')).toBe(true);
    expect(matches('<figure class="byline-annotated-image"></figure>')).toBe(true);
    expect(matches('<section class="byline-scrolly"></section>')).toBe(true);
    expect(matches('<figure class="byline-visualization" data-mode="embed"></figure>')).toBe(true);
    expect(matches('<figure class="byline-visualization" data-mode="static"></figure>')).toBe(false);
    expect(matches('<p>Text only.</p><figure class="wp-block-image"><img src="/a.jpg" alt=""></figure>')).toBe(false);
  });
});

describe('Photo Gallery lightbox (#137 contract)', () => {
  it('makes unlinked Photo Gallery images openable through a generated, labelled button and leaves other galleries alone', () => {
    root.innerHTML = gallery(photo('a', { linked: false, alt: 'A field' }) + photo('b', { linked: false, alt: '' }))
      + gallery(photo('c', { linked: false }), 'is-style-byline-photo-pair');
    enhanceArticleGalleries(root);
    const buttons = Array.from(root.querySelectorAll('button.byline-gallery-opener'));
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Enlarge photograph: A field', 'Enlarge photograph 2 of 2']);
    expect(buttons.every((button) => button.getAttribute('aria-haspopup') === 'dialog' && (button as HTMLButtonElement).type === 'button' && button.querySelector('img'))).toBe(true);
    // Another gallery style only enhances images the writer already linked to an image.
    expect(root.querySelectorAll('.is-style-byline-photo-pair button')).toHaveLength(0);
    expect(root.querySelector('.is-style-byline-photo-pair')!.getAttribute('data-byline-lightbox')).toBeNull();
  });

  it('keeps ordinary links as links and ignores non-image and download links', () => {
    root.innerHTML = gallery(photo('a') + `<figure class="wp-block-image"><a href="${base}/page.html"><img src="${base}/p.jpg" alt="page"></a></figure><figure class="wp-block-image"><a href="${base}/d.jpg" download><img src="${base}/d.jpg" alt="d"></a></figure>`, 'is-style-byline-photo-pair');
    enhanceArticleGalleries(root);
    expect(root.querySelectorAll('button')).toHaveLength(0);
    const links = Array.from(root.querySelectorAll('a'));
    expect(links.map((link) => link.getAttribute('aria-haspopup'))).toEqual(['dialog', null, null]);
  });

  it('opens the full original first and loads nothing before opening', () => {
    root.innerHTML = gallery(photo('a') + photo('b') + photo('c'));
    enhanceArticleGalleries(root);
    expect(dialog()).toBeNull();
    expect(created).toEqual([]);
    const link = root.querySelector<HTMLAnchorElement>('a')!;
    expect(claimed(link)).toBe(true);
    expect(dialog()!.hasAttribute('open')).toBe(true);
    expect(shown()).toBe(`${base}/a.jpg`);
    // Neighbours are warmed only once the opened photograph has loaded.
    expect(created).toEqual([]);
    settle();
    expect(created.sort()).toEqual([`${base}/b.jpg`, `${base}/c.jpg`]);
    expect(dialog()!.querySelector('figcaption')!.textContent).toBe('a caption');
    expect(dialog()!.querySelector('[role="status"]')!.textContent).toBe('Photograph 1 of 3');
  });

  it('resolves the source in order: full-url attribute, image link, widest srcset, currentSrc, src', () => {
    const open = (html: string, current = '') => {
      root.innerHTML = gallery(html);
      const cleanup = enhanceArticleGalleries(root);
      const image = root.querySelector('img')!;
      if (current) Object.defineProperty(image, 'currentSrc', { value: current });
      (root.querySelector('a, button.byline-gallery-opener') as HTMLElement).click();
      const source = shown();
      cleanup();
      return source;
    };
    // 1. data-byline-full-url wins, even over a different link.
    expect(open(`<figure class="wp-block-image"><a href="${base}/linked.jpg"><img data-byline-full-url="${base}/full.jpg" src="${base}/s-300x200.jpg" srcset="${base}/s-300x200.jpg 300w, ${base}/s-1536x1024.jpg 1536w" alt=""></a></figure>`)).toBe(`${base}/full.jpg`);
    // 2. A link to an image file.
    expect(open(`<figure class="wp-block-image"><a href="${base}/linked.jpg"><img src="${base}/s-300x200.jpg" srcset="${base}/s-300x200.jpg 300w, ${base}/s-1536x1024.jpg 1536w" alt=""></a></figure>`)).toBe(`${base}/linked.jpg`);
    // 3. The widest srcset candidate (unlinked, no full url).
    expect(open(photo('w', { linked: false, full: false }), `${base}/current.jpg`)).toBe(`${base}/w-1536x1024.jpg`);
    // 4. currentSrc, then 5. src.
    expect(open(photo('x', { linked: false, full: false, srcset: false }), `${base}/current.jpg`)).toBe(`${base}/current.jpg`);
    expect(open(photo('y', { linked: false, full: false, srcset: false }))).toBe(`${base}/y-1024x683.jpg`);
    // A full-url that is not an image falls through to the next source.
    expect(open(`<figure class="wp-block-image"><img data-byline-full-url="javascript:alert(1)" src="${base}/safe-300x200.jpg" alt=""></figure>`)).toBe(`${base}/safe-300x200.jpg`);
  });

  it('falls back to the next source when an original fails to load', () => {
    root.innerHTML = gallery(photo('a'));
    enhanceArticleGalleries(root);
    root.querySelector<HTMLAnchorElement>('a')!.click();
    expect(shown()).toBe(`${base}/a.jpg`);
    const image = dialog()!.querySelector('img')!;
    image.onerror!(new Event('error'));
    expect(image.getAttribute('src')).toBe(`${base}/a-1536x1024.jpg`);
  });

  it('preserves modified link clicks, supports keyboard navigation and returns focus on close', () => {
    root.innerHTML = gallery(photo('a') + photo('b'));
    enhanceArticleGalleries(root);
    const [first, second] = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'));
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(claimed(first, init), JSON.stringify(init)).toBe(false);
    }
    expect(dialog()).toBeNull();
    second.focus();
    second.click();
    expect(shown()).toBe(`${base}/b.jpg`);
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(shown()).toBe(`${base}/a.jpg`);
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(shown()).toBe(`${base}/b.jpg`);
    dialog()!.close();
    expect(document.activeElement).toBe(second);
    expect(dialog()!.querySelector('img')!.hasAttribute('src')).toBe(false);
  });

  it('is idempotent and its cleanup restores the saved markup', () => {
    root.innerHTML = gallery(photo('a', { linked: false }) + photo('b')) ;
    const saved = root.innerHTML;
    const cleanup = enhanceArticleGalleries(root);
    expect(root.querySelectorAll('button.byline-gallery-opener')).toHaveLength(1);
    // A second pass finds the gallery already enhanced.
    const again = enhanceArticleGalleries(root);
    expect(root.querySelectorAll('button.byline-gallery-opener')).toHaveLength(1);
    again();
    root.querySelector<HTMLAnchorElement>('a')!.click();
    expect(dialog()).not.toBeNull();
    cleanup();
    expect(dialog()).toBeNull();
    expect(root.innerHTML).toBe(saved);
    expect(claimed(root.querySelector('a')!)).toBe(false);
  });

  it('is the gallery behaviour of the shared story enhancer, scoped to its root', () => {
    root.innerHTML = gallery(photo('a', { linked: false }));
    const outside = document.createElement('div');
    outside.innerHTML = gallery(photo('z', { linked: false }));
    document.body.append(outside);
    const cleanup = enhanceArticleStory(root);
    expect(root.querySelectorAll('button.byline-gallery-opener')).toHaveLength(1);
    expect(outside.querySelectorAll('button')).toHaveLength(0);
    // The private preview never opens lightboxes.
    cleanup();
    expect(root.querySelectorAll('button')).toHaveLength(0);
    enhanceArticleStory(root, { preview: true })();
    expect(root.querySelectorAll('button')).toHaveLength(0);
  });
});
