import { useCallback, useRef, useState } from "react";

export type DialogTarget<T> = { open: boolean; target: T | null; session: number };

/**
 * State for a dialog that edits one record (or creates one when `target` is
 * null). `session` changes on every open so the form remounts with fresh state
 * while the dialog keeps its exit animation. Focus goes back to the row that
 * opened it, or to `fallback` when that row has since been removed.
 */
export function useDialogTarget<T>(fallbackSelector: string) {
  const [state, setState] = useState<DialogTarget<T>>({ open: false, target: null, session: 0 });
  const origin = useRef<HTMLElement | null>(null);
  const openWith = useCallback((target: T | null, trigger?: HTMLElement | null) => {
    origin.current = trigger ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
    setState((current) => ({ open: true, target, session: current.session + 1 }));
  }, []);
  const close = useCallback(() => setState((current) => ({ ...current, open: false })), []);
  const finalFocus = useCallback(() => {
    if (origin.current?.isConnected) return origin.current;
    return document.querySelector<HTMLElement>(fallbackSelector);
  }, [fallbackSelector]);
  return { ...state, openWith, close, finalFocus };
}
