import { visualizationUrl, visualizationHeight, visualizationMessageHeight } from '../visualization';

/**
 * Chart / Map embeds. The saved figure always holds the fallback graphic and a
 * direct link; this adds the provider iframe (public) or a same-size placeholder
 * (private preview) on top. Returns its cleanup.
 */
export function enhanceVisualizations(root: HTMLElement, signal: AbortSignal, preview: boolean): (() => void) {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const cleanups: (() => void)[] = [];
  const options = { preview };
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

  return () => cleanups.forEach((fn) => fn());
}
