import { enhanceArticleGalleries } from './gallery';
import { visualizationUrl, visualizationHeight, visualizationMessageHeight } from '../visualization';

export { articleEnhancementSelector } from './selector';
export type ArticleEnhancementOptions = { preview?: boolean };
const sessions = new WeakMap<ParentNode, () => void>();

/** Framework-free, scoped to the owning document (including preview iframes).
 * Repeated initialization is a no-op. Cleanup releases observers/listeners and
 * restores the linear presentation before a host unmounts the article. */
export function enhanceArticleStory(root: HTMLElement, options: ArticleEnhancementOptions = {}): () => void {
  const previous = sessions.get(root);
  if (previous) return previous;
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (!view) return () => {};
  const abort = new view.AbortController();
  const signal = abort.signal;
  const cleanups: (() => void)[] = [];
  if (!options.preview) cleanups.push(enhanceArticleGalleries(root));
  const frames = new Map<HTMLIFrameElement, NonNullable<ReturnType<typeof visualizationUrl>>>();
  root.querySelectorAll<HTMLElement>('.byline-visualization[data-mode="embed"]').forEach((figure) => {
    const validated = visualizationUrl(figure.dataset.src || '');
    if (!validated || validated.provider !== figure.dataset.provider) return;
    const media = figure.querySelector<HTMLElement>('.byline-visualization-media');
    if (!media) return;
    media.classList.add('is-enhanced');
    cleanups.push(() => media.classList.remove('is-enhanced'));
    if (options.preview) {
      const placeholder = document.createElement('div');
      placeholder.className = 'byline-visualization-placeholder';
      placeholder.style.height = `${visualizationHeight(figure.dataset.height || '')}px`;
      media.prepend(placeholder);
      cleanups.push(() => placeholder.remove());
      return;
    }
    const frame = document.createElement('iframe');
    frame.src = validated.src;
    frame.title = figure.querySelector('h2,h3,h4')?.textContent || 'Interactive visualization';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    frame.style.height = `${visualizationHeight(figure.dataset.height || '')}px`;
    frame.className = 'byline-visualization-frame';
    media.prepend(frame);
    frames.set(frame, validated);
    // Fallback stays available until an iframe actually loads, and its direct
    // link remains present even after load (provider errors can return 200).
    const fallback = figure.querySelector<HTMLElement>('.byline-visualization-fallback-image');
    frame.addEventListener('load', () => { if (fallback) fallback.hidden = true; }, { signal });
    cleanups.push(() => { frame.remove(); if (fallback) fallback.hidden = false; });
  });
  view.addEventListener('message', (event) => {
    for (const [frame, validated] of frames) {
      if (event.source !== frame.contentWindow || event.origin !== new URL(validated.src).origin) continue;
      const height = visualizationMessageHeight(event.data, validated.provider, validated.id);
      if (height !== null) frame.style.height = `${height}px`;
      break;
    }
  }, { signal });

  root.querySelectorAll<HTMLElement>('.byline-annotated-image').forEach((figure) => {
    const markers = Array.from(figure.querySelectorAll<HTMLAnchorElement>('.byline-annotation-marker'));
    const notes = Array.from(figure.querySelectorAll<HTMLElement>('.byline-annotations > li'));
    function select(id: string) {
      markers.forEach((marker) => {
        const active = marker.hash === `#${id}`;
        marker.classList.toggle('is-active', active);
        if (active) marker.setAttribute('aria-current', 'true'); else marker.removeAttribute('aria-current');
      });
      notes.forEach((note) => note.classList.toggle('is-active', note.id === id));
    }
    markers.forEach((marker) => {
      marker.addEventListener('focus', () => select(marker.hash.slice(1)), { signal });
      marker.addEventListener('click', () => select(marker.hash.slice(1)), { signal });
    });
    notes.forEach((note) => {
      note.addEventListener('focusin', () => select(note.id), { signal });
      note.addEventListener('click', () => select(note.id), { signal });
    });
  });

  root.querySelectorAll<HTMLElement>('.byline-before-after').forEach((figure) => {
    const images = figure.querySelectorAll<HTMLImageElement>('.byline-comparison-image img');
    if (images.length !== 2) return;
    const labels = document.createElement('div');
    labels.className = 'byline-comparison-labels';
    for (const label of figure.querySelectorAll('.byline-comparison-image strong')) { const copy = document.createElement('span'); copy.textContent = label.textContent; labels.append(copy); }
    figure.querySelector('.byline-comparison-images')!.append(labels);
    const control = document.createElement('label');
    control.className = 'byline-comparison-control';
    const text = document.createElement('span');
    text.textContent = `Compare ${figure.querySelector('[data-before]')?.textContent || 'Before'} and ${figure.querySelector('[data-after]')?.textContent || 'After'}`;
    const range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '100'; range.value = '50';
    function update() {
      figure.style.setProperty('--comparison-position', `${range.value}%`);
      range.setAttribute('aria-valuetext', `${range.value}% after image revealed`);
    }
    range.addEventListener('input', update, { signal });
    update(); control.append(text, range);
    figure.querySelector('.byline-comparison-images')!.after(control);
    figure.classList.add('is-enhanced');
    cleanups.push(() => { control.remove(); labels.remove(); figure.classList.remove('is-enhanced'); });
  });

  const desktop = view.matchMedia('(min-width: 900px) and (prefers-reduced-motion: no-preference)');
  root.querySelectorAll<HTMLElement>('.byline-scrolly').forEach((story) => {
    let observer: IntersectionObserver | undefined;
    let stage: HTMLElement | undefined;
    const steps = Array.from(story.querySelectorAll<HTMLElement>(':scope > .byline-scrolly-step'));
    function reset() {
      observer?.disconnect(); stage?.remove(); stage = undefined;
      story.classList.remove('is-enhanced');
    }
    function initialize() {
      reset();
      if (!desktop.matches || !view!.IntersectionObserver || !steps.length || steps.some((step) => !step.querySelector('.byline-scrolly-media img'))) return;
      stage = document.createElement('div');
      stage.className = 'byline-scrolly-stage'; stage.style.gridRow = `1 / span ${steps.length}`; stage.setAttribute('aria-hidden', 'true');
      const image = document.createElement('img'); image.alt = '';
      const caption = document.createElement('p'); caption.className = 'byline-scrolly-stage-caption';
      stage.append(image, caption); story.prepend(stage);
      function show(step: HTMLElement) {
        const source = step.querySelector<HTMLImageElement>('.byline-scrolly-media img')!;
        for (const name of ['src', 'srcset', 'sizes', 'width', 'height']) {
          const value = source.getAttribute(name);
          if (value) image.setAttribute(name, value); else image.removeAttribute(name);
        }
        caption.textContent = step.querySelector('figcaption')?.textContent || '';
        stage!.dataset.step = String(steps.indexOf(step));
      }
      show(steps[0]);
      observer = new view!.IntersectionObserver((entries) => {
        const active = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (active) show(active.target as HTMLElement);
      }, { rootMargin: '-25% 0px -35% 0px', threshold: [0, .1, .5] });
      steps.forEach((step) => observer!.observe(step));
      story.classList.add('is-enhanced');
    }
    initialize();
    desktop.addEventListener('change', initialize, { signal });
    cleanups.push(reset);
  });
  const cleanup = () => { abort.abort(); cleanups.forEach((fn) => fn()); sessions.delete(root); };
  sessions.set(root, cleanup);
  return cleanup;
}
