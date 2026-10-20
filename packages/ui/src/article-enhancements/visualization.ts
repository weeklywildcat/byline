import { visualizationUrl, visualizationHeight, visualizationMessageHeight, visualizationPieceName, visualizationPreviewNote } from '../visualization';

/**
 * Chart / Map embeds. The saved figure always holds the fallback graphic and a
 * direct link, inside a slot that CSS sizes from `data-height`, so nothing moves
 * when this adds the provider iframe (public) or labels the fallback as a
 * preview (private preview, which never loads a provider). Returns its cleanup.
 */
export function enhanceVisualizations(root: HTMLElement, signal: AbortSignal, preview: boolean): (() => void) {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const cleanups: (() => void)[] = [];
  const frames = new Map<HTMLIFrameElement, NonNullable<ReturnType<typeof visualizationUrl>>>();
  root.querySelectorAll<HTMLElement>('.byline-visualization[data-mode="embed"]').forEach((figure) => {
    const validated = visualizationUrl(figure.dataset.src || '');
    if (!validated || validated.provider !== figure.dataset.provider) return;
    const media = figure.querySelector<HTMLElement>('.byline-visualization-media');
    if (!media) return;
    const fallback = figure.querySelector<HTMLElement>('.byline-visualization-fallback-image');
    if (preview) {
      // The fallback graphic stands in for the embed; say so, or draw a labelled
      // stand-in when there is no graphic to show.
      const note = document.createElement('p');
      note.className = 'byline-visualization-badge';
      const lead = document.createElement('strong');
      lead.textContent = 'Preview:';
      note.append(lead, ` ${visualizationPreviewNote(validated.provider)}`);
      const added: HTMLElement[] = [note];
      if (!fallback?.querySelector('img')) {
        const placeholder = document.createElement('div');
        placeholder.className = 'byline-visualization-placeholder';
        placeholder.textContent = visualizationPieceName(validated.provider);
        added.push(placeholder);
      }
      media.append(...added);
      cleanups.push(() => added.forEach((element) => element.remove()));
      return;
    }
    const frame = document.createElement('iframe');
    frame.src = validated.src;
    frame.title = figure.querySelector('.byline-visualization-title, h2, h3, h4')?.textContent || 'Interactive visualization';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    frame.style.height = `${visualizationHeight(figure.dataset.height || '')}px`;
    frame.className = 'byline-visualization-frame';
    media.prepend(frame);
    frames.set(frame, validated);
    // The fallback graphic stays until an iframe actually loads, and the direct
    // link remains after load (provider errors can return 200).
    frame.addEventListener('load', () => { media.classList.add('is-loaded'); if (fallback) fallback.hidden = true; }, { signal });
    cleanups.push(() => { frame.remove(); media.classList.remove('is-loaded'); if (fallback) fallback.hidden = false; });
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
