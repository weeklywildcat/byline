import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

/** The current time, refreshed every minute, so "due tomorrow" stays true on a screen left open. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** A value that follows `value` after it has been still for `delay` ms. Used for typing in search. */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** The width of an element, for layouts that depend on the space the screen gives it rather than the viewport. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}


/**
 * Whether a CSS media query matches. Server-rendered hosts (the Payload
 * newsroom) hydrate with `serverValue` and then switch, so the markup never
 * mismatches; client-only hosts read the real value on their first render.
 * Layout that depends on the viewport goes through here, never a component's
 * own `matchMedia`.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia?.(query);
    if (!media) return () => {};
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? serverValue, () => serverValue);
}

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/** Whether the current viewport is below the shadcn Sidebar mobile breakpoint ("not mobile" while hydrating). */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

export function useAnyCoarsePointer(): boolean {
  return useMediaQuery("(any-pointer: coarse)");
}

let observedFineHover = false;
const fineHoverListeners = new Set<() => void>();
let stopFineHoverObservation: (() => void) | null = null;

function startFineHoverObservation() {
  if (stopFineHoverObservation || typeof window === "undefined") return;
  const observe = (event: PointerEvent) => {
    // Safari exposes Apple Pencil hover as pen pointer movement even though
    // its interaction media queries may still report that nothing can hover.
    // buttons === 0 keeps ordinary Pencil contact from teaching the app that
    // a hover-capable pointer exists.
    if (observedFineHover || event.buttons !== 0 || (event.pointerType !== "pen" && event.pointerType !== "mouse")) return;
    observedFineHover = true;
    fineHoverListeners.forEach((listener) => listener());
  };
  window.addEventListener("pointermove", observe, { capture: true, passive: true });
  stopFineHoverObservation = () => window.removeEventListener("pointermove", observe, { capture: true });
}

function subscribeFineHoverObservation(onChange: () => void) {
  fineHoverListeners.add(onChange);
  startFineHoverObservation();
  return () => {
    fineHoverListeners.delete(onChange);
    if (!fineHoverListeners.size && stopFineHoverObservation) {
      stopFineHoverObservation();
      stopFineHoverObservation = null;
    }
  };
}

function useObservedFineHover(): boolean {
  return useSyncExternalStore(subscribeFineHoverObservation, () => observedFineHover, () => false);
}

/**
 * Whether a precise hover-capable input is available.
 *
 * Media queries cover mouse/trackpad hybrid devices. The observed-pointer
 * fallback also covers Apple Pencil hover in Safari, which dispatches pen
 * hover pointer events without consistently matching `any-hover: hover`.
 */
export function useFineHoverPointer(): boolean {
  const mediaHover = useMediaQuery("(any-hover: hover) and (any-pointer: fine)");
  const observedHover = useObservedFineHover();
  return mediaHover || observedHover;
}

/**
 * Renders a long list in steps: the first `initial` items at once, then
 * `step` more each time the sentinel (placed after the last rendered item)
 * comes within `rootMargin` of the scroll viewport. Ordinary lists (fewer
 * than `initial` items) render in full, so search-in-page, keyboard order
 * and drag and drop behave as before; only long archives are stepped.
 * The count resets when the list's identity (`resetKey`) changes.
 */
export function useIncrementalItems<T>(items: readonly T[], options: { initial?: number; step?: number; rootMargin?: string; resetKey?: unknown } = {}): { visible: readonly T[]; hasMore: boolean; sentinel: (element: Element | null) => void } {
  const { initial = 100, step = 100, rootMargin = "800px", resetKey } = options;
  const [count, setCount] = useState(initial);
  const [element, setElement] = useState<Element | null>(null);
  useEffect(() => { setCount(initial); }, [resetKey, initial]);
  const hasMore = items.length > count;
  useEffect(() => {
    if (!element || !hasMore || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setCount((current) => current + step);
    }, { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, hasMore, step, rootMargin]);
  return { visible: hasMore ? items.slice(0, count) : items, hasMore, sentinel: setElement };
}
