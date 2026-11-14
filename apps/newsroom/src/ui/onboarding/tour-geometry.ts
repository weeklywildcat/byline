"use client";

import { useEffect, useState } from "react";

export type Box = { top: number; left: number; width: number; height: number };
export type Viewport = { width: number; height: number };

/** Room around the highlighted control, so the ring never touches it. */
export const SPOTLIGHT_PADDING = 6;

/** The highlighted area: the target plus padding, kept inside the viewport. */
export function spotlightHole(rect: Box, viewport: Viewport, padding = SPOTLIGHT_PADDING): Box {
  const left = Math.max(0, rect.left - padding);
  const top = Math.max(0, rect.top - padding);
  const right = Math.min(viewport.width, rect.left + rect.width + padding);
  const bottom = Math.min(viewport.height, rect.top + rect.height + padding);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * The four panes that dim everything outside the hole (and catch pointer
 * input there). The hole itself is left open, so the real control under it
 * stays usable when a step asks the reader to use it.
 */
export function spotlightPanes(hole: Box, viewport: Viewport): Record<"top" | "bottom" | "left" | "right", Box> {
  const bottom = hole.top + hole.height;
  const right = hole.left + hole.width;
  return {
    top: { top: 0, left: 0, width: viewport.width, height: hole.top },
    bottom: { top: bottom, left: 0, width: viewport.width, height: Math.max(0, viewport.height - bottom) },
    left: { top: hole.top, left: 0, width: hole.left, height: hole.height },
    right: { top: hole.top, left: right, width: Math.max(0, viewport.width - right), height: hole.height }
  };
}

const sameBox = (a: Box | null, b: Box | null) => a === b || Boolean(a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

const layoutViewport = (): Viewport => ({ width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight });

/**
 * The target's rectangle and the viewport, measured at most once per frame
 * and only when something that can move it happens: resize, any scroll,
 * the Visual Viewport (keyboard, zoom), orientation, the target's own size,
 * and transitions finishing (the sidebar sliding). Nothing else in the page
 * is measured.
 */
export function useTargetGeometry(element: Element | null): { rect: Box | null; viewport: Viewport } {
  const [geometry, setGeometry] = useState<{ rect: Box | null; viewport: Viewport }>(() => ({ rect: null, viewport: typeof window === "undefined" ? { width: 0, height: 0 } : layoutViewport() }));
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const viewport = layoutViewport();
      const box = element?.isConnected ? element.getBoundingClientRect() : null;
      const rect = box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
      setGeometry((previous) => (sameBox(previous.rect, rect) && previous.viewport.width === viewport.width && previous.viewport.height === viewport.height ? previous : { rect, viewport }));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    const passive = { passive: true, capture: true } as const;
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("scroll", schedule, passive);
    document.addEventListener("transitionend", schedule, true);
    const visual = window.visualViewport;
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (element) observer?.observe(element);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule, passive);
      document.removeEventListener("transitionend", schedule, true);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, [element]);
  return geometry;
}

export type Insets = { top: number; right: number; bottom: number; left: number };

/**
 * The device's safe-area insets in px (`--byline-safe-*`, from `env()`), for
 * keeping the tour card off the notch and home indicator. Read from a probe,
 * since a custom property holding `env()` is not resolved by getComputedStyle.
 */
export function readSafeAreaInsets(): Insets {
  if (typeof document === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:var(--byline-safe-top,0px) var(--byline-safe-right,0px) var(--byline-safe-bottom,0px) var(--byline-safe-left,0px)";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  return insets;
}
