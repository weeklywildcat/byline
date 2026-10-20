/**
 * Scrollytelling stage.
 *
 * Ordinary document scrolling only: no scroll-jacking, no scroll handlers.
 * The linear story stays in the DOM; on wide, motion-tolerant screens a sticky
 * (aria-hidden) duplicate of the active step's photograph is added, with its
 * caption and credit and a quiet "step n of N" cue.
 *
 * Which step is active is defined by a fixed reading line, not by how much of
 * each step is visible: a step is active while it covers the line that sits
 * `SCROLLY_ACTIVATION_LINE` percent from the top of the viewport. The line is
 * observed as a thin horizontal band by one IntersectionObserver.
 *
 * The stage changes the story's layout, and so does leaving it (a narrower window,
 * reduced motion switched on). The enhancer keeps whichever step the reader is on
 * under the reading line while it does, so a reload or a back navigation does not
 * drop them somewhere else in the story. That one adjustment is the only time it
 * moves the scroll position.
 *
 * A step without a photograph keeps the stage on the previous one; steps before
 * the first photograph show that first photograph. A story with no photographs
 * stays linear.
 */

/** Percent of the viewport height, measured from the top, where the next step takes over. */
export const SCROLLY_ACTIVATION_LINE = 40;
/** Height of the observed band, in percent of the viewport. */
const BAND = 1;
/** The longest a crossfade can take, in ms, before the outgoing photograph is removed anyway. */
const FADE_LIMIT = 400;

export function enhanceScrolly(story: HTMLElement, signal: AbortSignal): () => void {
  const doc = story.ownerDocument;
  const view = doc.defaultView!;
  const desktop = view.matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)");
  const steps = Array.from(story.querySelectorAll<HTMLElement>(":scope > .byline-scrolly-step"));
  const sourceImage = (step: HTMLElement) => step.querySelector<HTMLImageElement>(".byline-scrolly-media img");
  let observer: IntersectionObserver | undefined;
  let stage: HTMLElement | undefined;
  let timers: number[] = [];

  /** Run a layout change without losing the reader's place: the step under the reading line stays under it. */
  function holdPosition(change: () => void) {
    const line = (view.innerHeight * SCROLLY_ACTIVATION_LINE) / 100;
    const anchor = steps.find((step) => { const box = step.getBoundingClientRect(); return box.top <= line && box.bottom > line; });
    const before = anchor?.getBoundingClientRect().top ?? 0;
    change();
    const shift = anchor ? anchor.getBoundingClientRect().top - before : 0;
    if (Math.abs(shift) > 1) view.scrollBy(0, shift);
  }

  /** The step whose photograph the stage shows while `index` is read. */
  function photographFor(index: number): HTMLElement {
    for (let i = index; i >= 0; i -= 1) if (sourceImage(steps[i])) return steps[i];
    return steps.find((step) => sourceImage(step))!;
  }

  function removeStage() {
    observer?.disconnect();
    observer = undefined;
    timers.forEach((timer) => view.clearTimeout(timer));
    timers = [];
    stage?.remove();
    stage = undefined;
    story.classList.remove("is-enhanced", "is-portrait");
  }
  const reset = () => holdPosition(removeStage);

  /** A story of mostly portrait photographs gives the stage half the width instead of three fifths. */
  function isPortrait() {
    const ratios = steps.map(sourceImage).filter((image): image is HTMLImageElement => Boolean(image)).map((image) => Number(image.getAttribute("width")) / Number(image.getAttribute("height")));
    const known = ratios.filter(Number.isFinite);
    return known.length > 0 && known.filter((ratio) => ratio < 1).length > known.length / 2;
  }

  function initialize() {
    holdPosition(build);
  }

  function build() {
    removeStage();
    if (!desktop.matches || !view.IntersectionObserver || !steps.some(sourceImage)) return;

    const current = doc.createElement("div");
    stage = current;
    current.className = "byline-scrolly-stage";
    current.style.gridRow = `1 / span ${steps.length}`;
    current.setAttribute("aria-hidden", "true");
    current.dataset.activationLine = String(SCROLLY_ACTIVATION_LINE);
    current.dataset.fit = story.dataset.fit === "cover" ? "cover" : "contain";

    const progress = doc.createElement("div");
    progress.className = "byline-scrolly-progress byline-kicker";
    const count = doc.createElement("span");
    const ticks = doc.createElement("span");
    ticks.className = "byline-scrolly-ticks";
    const marks = steps.map(() => ticks.appendChild(doc.createElement("i")));
    progress.append(count, ticks);
    const frames = doc.createElement("div");
    frames.className = "byline-scrolly-frames";
    current.append(progress, frames);
    story.prepend(current);

    let shown: HTMLElement | undefined;
    function show(index: number) {
      const owner = photographFor(index);
      count.textContent = `Step ${index + 1} of ${steps.length}`;
      marks.forEach((mark, i) => { mark.className = i < index ? "is-past" : i === index ? "is-active" : ""; });
      current.dataset.step = String(index);
      if (owner === shown) return;
      shown = owner;

      // Caption and credit are separate blocks in the source and stay apart on the stage.
      const frame = doc.createElement("figure");
      frame.className = "byline-scrolly-frame is-entering";
      const source = sourceImage(owner)!;
      const image = doc.createElement("img");
      image.alt = "";
      for (const name of ["src", "srcset", "sizes", "width", "height"]) {
        const value = source.getAttribute(name);
        if (value) image.setAttribute(name, value);
      }
      frame.append(image);
      const figcaption = owner.querySelector("figcaption");
      if (figcaption) frame.append(figcaption.cloneNode(true));

      // Crossfade: the previous photograph leaves while the new one arrives, then it is removed.
      const outgoing = Array.from(frames.children);
      outgoing.forEach((old) => old.classList.add("is-leaving"));
      frames.append(frame);
      timers.push(view.setTimeout(() => frame.classList.remove("is-entering"), 20));
      timers.push(view.setTimeout(() => outgoing.forEach((old) => old.remove()), FADE_LIMIT));
    }
    // The first photograph is simply there; only changes fade.
    show(0);
    frames.querySelector(".is-entering")?.classList.remove("is-entering");
    if (isPortrait()) story.classList.add("is-portrait");

    const options: IntersectionObserverInit = {
      rootMargin: `-${SCROLLY_ACTIVATION_LINE}% 0px -${100 - SCROLLY_ACTIVATION_LINE - BAND}% 0px`,
      threshold: 0
    };
    const callback: IntersectionObserverCallback = (entries) => {
      // Steps are contiguous, so one covers the line at a time. A large jump
      // can report several entering steps in one batch; the last wins.
      const covering = entries.filter((entry) => entry.isIntersecting).map((entry) => steps.indexOf(entry.target as HTMLElement));
      if (covering.length) show(Math.max(...covering));
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
