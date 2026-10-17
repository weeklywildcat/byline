/**
 * Scrollytelling stage.
 *
 * Ordinary document scrolling only: no scroll-jacking, no scroll handlers.
 * The linear story stays in the DOM; on wide, motion-tolerant screens a sticky
 * (aria-hidden) duplicate of the active step's image is added.
 *
 * Which step is active is defined by a fixed reading line, not by how much of
 * each step is visible: a step is active while it covers the line that sits
 * `SCROLLY_ACTIVATION_LINE` percent from the top of the viewport. The line is
 * observed as a thin horizontal band by one IntersectionObserver.
 */

/** Percent of the viewport height, measured from the top, where the next step takes over. */
export const SCROLLY_ACTIVATION_LINE = 40;
/** Height of the observed band, in percent of the viewport. */
const BAND = 1;

export function enhanceScrolly(story: HTMLElement, signal: AbortSignal): () => void {
  const doc = story.ownerDocument;
  const view = doc.defaultView!;
  const desktop = view.matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)");
  const steps = Array.from(story.querySelectorAll<HTMLElement>(":scope > .byline-scrolly-step"));
  let observer: IntersectionObserver | undefined;
  let stage: HTMLElement | undefined;

  function reset() {
    observer?.disconnect();
    observer = undefined;
    stage?.remove();
    stage = undefined;
    story.classList.remove("is-enhanced");
  }

  function initialize() {
    reset();
    if (!desktop.matches || !view.IntersectionObserver || !steps.length || steps.some((step) => !step.querySelector(".byline-scrolly-media img"))) return;

    const current = doc.createElement("div");
    stage = current;
    current.className = "byline-scrolly-stage";
    current.style.gridRow = `1 / span ${steps.length}`;
    current.setAttribute("aria-hidden", "true");
    current.dataset.activationLine = String(SCROLLY_ACTIVATION_LINE);
    const image = doc.createElement("img");
    image.alt = "";
    const caption = doc.createElement("p");
    caption.className = "byline-scrolly-stage-caption";
    current.append(image, caption);
    story.prepend(current);

    function show(step: HTMLElement) {
      const source = step.querySelector<HTMLImageElement>(".byline-scrolly-media img")!;
      for (const name of ["src", "srcset", "sizes", "width", "height"]) {
        const value = source.getAttribute(name);
        if (value) image.setAttribute(name, value); else image.removeAttribute(name);
      }
      // Caption and credit are separate blocks in the source; keep them apart in the copy.
      const figcaption = step.querySelector("figcaption");
      caption.textContent = Array.from(figcaption?.childNodes ?? []).map((node) => node.textContent?.trim()).filter(Boolean).join(" ");
      current.dataset.step = String(steps.indexOf(step));
    }
    show(steps[0]);

    const options: IntersectionObserverInit = {
      rootMargin: `-${SCROLLY_ACTIVATION_LINE}% 0px -${100 - SCROLLY_ACTIVATION_LINE - BAND}% 0px`,
      threshold: 0
    };
    const callback: IntersectionObserverCallback = (entries) => {
      // Steps are contiguous, so one covers the line at a time. A large jump
      // can report several entering steps in one batch; the last wins.
      const covering = entries.filter((entry) => entry.isIntersecting).map((entry) => steps.indexOf(entry.target as HTMLElement));
      if (covering.length) show(steps[Math.max(...covering)]);
    };
    try {
      // The margin must be measured against this document's viewport, which
      // differs from the implicit (top-level) root inside the preview iframe.
      observer = new view.IntersectionObserver(callback, { ...options, root: doc });
    } catch {
      observer = new view.IntersectionObserver(callback, options);
    }
    steps.forEach((step) => observer!.observe(step));
    story.classList.add("is-enhanced");
  }

  initialize();
  desktop.addEventListener("change", initialize, { signal });
  return reset;
}
