const youTubeNoCookieEmbed = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}`;

/**
 * Media chapters are ordinary timestamp links in the page (`audio.wav#t=84`,
 * `youtube.com/watch?v=…&t=84s`), so they work with no script. Enhanced:
 *
 * - Audio: the link seeks the native `<audio>` element of its own block and
 *   plays from there (the reader asked for it).
 * - Video: the link re-cues the privacy-enhanced player at that time with the
 *   documented `start` parameter, without autoplay, and moves focus to the
 *   player so one more key press plays it. No YouTube script is loaded.
 *
 * Modified clicks (new tab, new window) are left alone. Returns its cleanup.
 */
export function enhanceMediaChapters(root: HTMLElement, signal: AbortSignal): () => void {
  const cleanups: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>('.byline-media-chapters').forEach((nav) => {
    const figure = nav.closest<HTMLElement>('.byline-audio, .byline-video');
    if (!figure) return;
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[data-byline-seek]'));
    const mark = (current: HTMLAnchorElement | null) => links.forEach((link) => (link === current ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current')));
    nav.addEventListener('click', (event) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-byline-seek]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const time = Number(link.dataset.bylineSeek);
      if (!Number.isInteger(time) || time < 0) return;
      const audio = figure.querySelector<HTMLAudioElement>('audio');
      if (audio) {
        event.preventDefault();
        audio.currentTime = time;
        void audio.play().catch(() => undefined);
        mark(link);
        return;
      }
      const iframe = figure.querySelector<HTMLIFrameElement>('.byline-video-frame iframe');
      const videoId = figure.dataset.videoId;
      if (iframe && videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        event.preventDefault();
        iframe.src = `${youTubeNoCookieEmbed(videoId)}?start=${time}`;
        mark(link);
        iframe.focus({ preventScroll: true });
        iframe.scrollIntoView?.({ block: 'nearest' });
      }
    }, { signal });
    cleanups.push(() => mark(null));
  });
  return () => cleanups.forEach((fn) => fn());
}
