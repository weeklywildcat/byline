import { useCallback, type RefCallback } from "react";

/**
 * Fixed overlays are positioned against the layout viewport. When the iOS or
 * iPadOS software keyboard opens (or the page is pinch-zoomed), the visible
 * area is the Visual Viewport instead, so a bottom action bar can sit under
 * the keyboard. This publishes the visible rectangle as insets on the element:
 *
 *   --byline-vv-top / -right / -bottom / -left   (px, relative to the layout viewport)
 *
 * Overlays use them with a `0px` fallback, so browsers without
 * `window.visualViewport` (and tests) keep plain `inset: 0`. It writes CSS
 * custom properties directly, once per animation frame, and never re-renders.
 */
export function trackVisualViewport(element: HTMLElement): () => void {
  const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
  if (!viewport) return () => {};
  let frame = 0;
  const apply = () => {
    frame = 0;
    const root = document.documentElement;
    const top = Math.max(0, viewport.offsetTop);
    const left = Math.max(0, viewport.offsetLeft);
    const right = Math.max(0, root.clientWidth - (left + viewport.width));
    const bottom = Math.max(0, root.clientHeight - (top + viewport.height));
    element.style.setProperty("--byline-vv-top", `${top}px`);
    element.style.setProperty("--byline-vv-left", `${left}px`);
    element.style.setProperty("--byline-vv-right", `${right}px`);
    element.style.setProperty("--byline-vv-bottom", `${bottom}px`);
  };
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(apply); };
  apply();
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  return () => {
    viewport.removeEventListener("resize", schedule);
    viewport.removeEventListener("scroll", schedule);
    if (frame) window.cancelAnimationFrame(frame);
    for (const name of ["top", "left", "right", "bottom"]) element.style.removeProperty(`--byline-vv-${name}`);
  };
}

/** A ref callback that keeps a fixed overlay inside the visible viewport while it is mounted. */
export function useVisualViewportFit(): RefCallback<HTMLElement> {
  return useCallback((element: HTMLElement | null) => (element ? trackVisualViewport(element) : undefined), []);
}

/** Classes for a fixed overlay that follows the visible viewport and keeps interactive content inside the safe area. */
export const VISUAL_VIEWPORT_INSET = "top-[var(--byline-vv-top,0px)] right-[var(--byline-vv-right,0px)] bottom-[var(--byline-vv-bottom,0px)] left-[var(--byline-vv-left,0px)]";
export const SAFE_AREA_PADDING = "pt-[max(1rem,var(--byline-safe-top))] pr-[max(1rem,var(--byline-safe-right))] pb-[max(1rem,var(--byline-safe-bottom))] pl-[max(1rem,var(--byline-safe-left))]";
/** The same padding from `md` up only: below it a full-bleed workspace pads its own header and footer. */
export const SAFE_AREA_PADDING_MD = "md:pt-[max(1rem,var(--byline-safe-top))] md:pr-[max(1rem,var(--byline-safe-right))] md:pb-[max(1rem,var(--byline-safe-bottom))] md:pl-[max(1rem,var(--byline-safe-left))]";
