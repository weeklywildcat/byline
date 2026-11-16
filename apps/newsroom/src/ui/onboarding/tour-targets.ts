/**
 * Stable tour anchors. Byline components mark the places a tour may point at
 * with `data-byline-tour="<anchor>"` (via `tourAnchor()`), never a class name
 * or DOM position. The same anchor can exist more than once (the desktop
 * sidebar, the tablet header and the phone's bottom bar each render Stories),
 * so a tour resolves the one the reader can actually see right now.
 */
export const TOUR_ATTRIBUTE = "data-byline-tour";

export type TourAnchor =
  | "home-screen"
  | "stories-screen"
  | "calendar-screen"
  | "media-screen"
  | "create"
  | "search"
  | "account"
  | "more"
  | `nav-${string}`;

/** Spread onto the element a tour may point at: `<nav {...tourAnchor("nav-stories")}>`. */
export function tourAnchor(anchor: TourAnchor): { "data-byline-tour": TourAnchor } {
  return { [TOUR_ATTRIBUTE]: anchor } as { "data-byline-tour": TourAnchor };
}

type Viewport = { width: number; height: number };

const viewport = (): Viewport => ({ width: window.innerWidth || document.documentElement.clientWidth, height: window.innerHeight || document.documentElement.clientHeight });

/**
 * Whether the reader can see and reach an element: laid out with a size,
 * not hidden by CSS, not inert, and at least partly inside the viewport
 * horizontally (an off-canvas sidebar is not). Vertically it may be scrolled
 * away; entering the step scrolls it into view.
 */
export function isTourTargetVisible(element: Element, view: Viewport = viewport()): boolean {
  if (!element.isConnected) return false;
  if (element.closest("[inert]")) return false;
  const check = (element as Element & { checkVisibility?: (options?: Record<string, boolean>) => boolean }).checkVisibility;
  if (typeof check === "function" && !check.call(element, { checkOpacity: true, checkVisibilityCSS: true })) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.right > 0 && rect.left < view.width;
}

/** The first visible element for the first anchor that has one (anchors in order of preference). */
export function resolveTourTarget(anchors: readonly string[], root: ParentNode = document): HTMLElement | null {
  const marked = Array.from(root.querySelectorAll<HTMLElement>(`[${TOUR_ATTRIBUTE}]`));
  for (const anchor of anchors) {
    for (const candidate of marked) {
      if (candidate.getAttribute(TOUR_ATTRIBUTE) === anchor && isTourTargetVisible(candidate)) return candidate;
    }
  }
  return null;
}

/** What covers the top and bottom of the viewport: the sticky app header and, on phones, the bottom navigation. */
export function viewportObstructions(): { top: number; bottom: number } {
  const header = document.querySelector(".byline-app-header");
  const bar = document.querySelector(".byline-primary-navigation");
  const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
  let bottom = 0;
  if (bar && getComputedStyle(bar).position === "fixed") bottom = Math.max(0, viewport().height - bar.getBoundingClientRect().top);
  return { top, bottom };
}

/** Whether a rectangle sits comfortably inside the unobstructed viewport. */
export function comfortablyVisible(rect: Pick<DOMRect, "top" | "bottom">, view: Viewport, obstructed: { top: number; bottom: number }, margin = 12): boolean {
  return rect.top >= obstructed.top + margin && rect.bottom <= view.height - obstructed.bottom - margin;
}

/** Whether something is fixed or sticky chrome (it never needs scrolling). */
function inFixedChrome(element: Element): boolean {
  for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/**
 * Scrolls a target into the clear part of the viewport if it is not already
 * comfortably visible, then resolves once its position has settled (two
 * still frames, at most ~700ms). Immediate under reduced motion.
 */
export function bringTargetIntoView(element: Element, { reducedMotion }: { reducedMotion: boolean }): Promise<void> {
  const view = viewport();
  const rect = element.getBoundingClientRect();
  const clear = comfortablyVisible(rect, view, viewportObstructions());
  if (clear || inFixedChrome(element)) return Promise.resolve();
  const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";
  // A tall target starts just below the sticky header; anything else is centred, clear of the header and bottom bar.
  if (rect.height > view.height * 0.6) window.scrollBy({ top: rect.top - viewportObstructions().top - 12, behavior });
  else element.scrollIntoView({ block: "center", inline: "nearest", behavior });
  return new Promise((resolve) => {
    const started = performance.now();
    let last = Number.NaN;
    let still = 0;
    const tick = () => {
      const top = element.getBoundingClientRect().top;
      still = top === last ? still + 1 : 0;
      last = top;
      if (still >= 2 || performance.now() - started > 700) resolve();
      else afterFrame(tick);
    };
    afterFrame(tick);
  });
}

/**
 * Runs `callback` after the next frame, or after `ms` if frames are not
 * running (a background tab pauses requestAnimationFrame). Returns a cancel.
 */
export function afterFrame(callback: () => void, ms = 100): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    callback();
  };
  const frame = window.requestAnimationFrame(run);
  const timer = window.setTimeout(run, ms);
  return () => {
    done = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
