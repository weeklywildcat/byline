/**
 * Annotated Image: keeps the numbered markers and the list of notes in step
 * (focus or click either one and both show it as active). The saved figure is a
 * complete, linked, ordered list without this.
 */
export function enhanceAnnotatedImage(figure: HTMLElement, signal: AbortSignal): void {
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
}
