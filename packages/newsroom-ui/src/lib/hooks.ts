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

export function useFineHoverPointer(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
