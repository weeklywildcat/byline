import { enhanceArticleGalleries } from './gallery';
import { enhanceBeforeAfter } from './before-after';
import { enhanceScrolly } from './scrolly';
import { visualizationUrl, visualizationHeight, visualizationMessageHeight } from '../visualization';

export { articleEnhancementSelector } from './selector';
export { SCROLLY_ACTIVATION_LINE } from './scrolly';
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
    const undo = enhanceBeforeAfter(figure, signal);
    if (undo) cleanups.push(undo);
  });
  root.querySelectorAll<HTMLElement>('.byline-scrolly').forEach((story) => cleanups.push(enhanceScrolly(story, signal)));
  const cleanup = () => { abort.abort(); cleanups.forEach((fn) => fn()); sessions.delete(root); };
  sessions.set(root, cleanup);
  return cleanup;
}
