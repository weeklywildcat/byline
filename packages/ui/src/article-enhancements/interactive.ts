import { INTERACTIVE_MEASURE_MESSAGE, interactiveMessageHeight } from '../interactive';

/**
 * Interactive blocks: the frames are already in the page with their
 * interactive and its sandbox; this only lets each one set its own height.
 * A height is accepted only from that frame's own window, whose sandboxed
 * origin is opaque ("null"). Returns its cleanup.
 */
export function enhanceInteractives(root: HTMLElement, signal: AbortSignal): () => void {
  const view = root.ownerDocument.defaultView!;
  const frames = Array.from(root.querySelectorAll<HTMLIFrameElement>('.byline-interactive iframe.byline-interactive-frame'));
  if (frames.length === 0) return () => {};
  const initial = frames.map((frame) => frame.style.height);
  view.addEventListener('message', (event) => {
    if (event.origin !== 'null') return;
    const frame = frames.find((candidate) => candidate.contentWindow !== null && event.source === candidate.contentWindow);
    if (!frame) return;
    const height = interactiveMessageHeight(event.data);
    if (height !== null) frame.style.height = `${height}px`;
  }, { signal });
  // The frame may have reported before this listener existed: ask again, now and when it (re)loads.
  const measure = (frame: HTMLIFrameElement) => frame.contentWindow?.postMessage(INTERACTIVE_MEASURE_MESSAGE, '*');
  frames.forEach((frame) => {
    frame.addEventListener('load', () => measure(frame), { signal });
    measure(frame);
  });
  return () => frames.forEach((frame, index) => { frame.style.height = initial[index]; });
}
