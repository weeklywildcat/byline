"use client";

import { useEffect, type RefObject } from "react";

/**
 * Blocks created while the writer works (from the slash menu, the Add menu or
 * an undo) take focus when they first appear, so writing continues inside
 * them. Blocks that load with the story never steal focus.
 */
const justCreated = new Set<string>();

export function markCreated(nodeKey: string): void {
  justCreated.add(nodeKey);
}

/** Focuses `target` once if this block was just created. */
export function useFocusWhenCreated(nodeKey: string, target: RefObject<HTMLElement | null>, ready = true): void {
  useEffect(() => {
    if (!ready || !justCreated.has(nodeKey)) return;
    justCreated.delete(nodeKey);
    const element = target.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [nodeKey, ready, target]);
}
