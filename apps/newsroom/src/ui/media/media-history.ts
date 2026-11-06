"use client";

import { useEffect, useRef } from "react";

/**
 * Browser history for Media, and the guard that keeps unsaved file details
 * from being lost to Back and Forward.
 *
 * `popstate` can't be cancelled: by the time it fires the address has already
 * moved. So the guard works in three steps, all before Next's own `popstate`
 * listener (this one is registered in the capture phase) can react:
 *
 * 1. Swallow the event (`stopImmediatePropagation`), so Next and React never
 *    see the traversal and the open file stays mounted with its draft.
 * 2. Undo it with `history.go(-delta)`. That fires a corrective `popstate`,
 *    swallowed the same way, which also confirms we're back where we were.
 * 3. Ask (the existing Save / Discard / Stay dialog). Stay leaves things as
 *    they are; Discard and a successful Save replay the traversal with
 *    `history.go(delta)`, flagged so that one `popstate` passes through to
 *    Next normally instead of being guarded again.
 *
 * To know the `delta` of a Back or Forward, every history entry Media writes
 * carries a small marker: a lineage id (one run of consecutive Media entries)
 * and an index (`pushState` adds one). A marked destination's delta is the
 * difference of indexes. Entries Media didn't write (the page before it, a
 * deep link, an older lineage) are "foreign": their delta comes from the
 * Navigation API's entry indexes where the browser has it, and otherwise is
 * taken to be one step before the first Media entry, which is what a single
 * Back out of Media is.
 */

const KEY = "bylineMedia";

type Marker = { lineage: string; index: number };
/** Where Media believes the browser is: the marker, and the Navigation API's entry index when there is one. */
type Position = { marker: Marker; entry: number | null };

/** How many corrective steps are attempted before asking anyway (never a loop). */
const MAX_CORRECTIONS = 4;

let settled: Position | null = null;

function markerOf(state: unknown): Marker | null {
  const value = state && typeof state === "object" ? (state as Record<string, unknown>)[KEY] : null;
  if (!value || typeof value !== "object") return null;
  const { lineage, index } = value as Partial<Marker>;
  return typeof lineage === "string" && typeof index === "number" && Number.isInteger(index) ? { lineage, index } : null;
}

function navigationEntryIndex(): number | null {
  const index = (window as { navigation?: { currentEntry?: { index?: number } | null } }).navigation?.currentEntry?.index;
  return typeof index === "number" && index >= 0 ? index : null;
}

const newLineage = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Knows the current entry: reads its marker, or starts a lineage on an entry
 * Media didn't write (a hard load, a deep link, a link from another Byline
 * page). The state holds only the marker; Next's own patched `replaceState`
 * adds back what it needs, and a state without `__NA` is how it learns the
 * address changed.
 */
function adopt(): Position {
  let marker = markerOf(window.history.state);
  if (!marker) {
    marker = { lineage: newLineage(), index: 0 };
    window.history.replaceState({ [KEY]: marker }, "");
  }
  settled = { marker, entry: navigationEntryIndex() };
  return settled;
}

/** A new Media entry, one after the current one. */
export function pushMediaEntry(href: string) {
  const here = markerOf(window.history.state) ?? adopt().marker;
  const marker = { lineage: here.lineage, index: here.index + 1 };
  window.history.pushState({ [KEY]: marker }, "", href);
  settled = { marker, entry: navigationEntryIndex() };
}

/** The current entry's address, in place (its marker stays). */
export function replaceMediaEntry(href: string) {
  const marker = markerOf(window.history.state) ?? adopt().marker;
  window.history.replaceState({ [KEY]: marker }, "", href);
  settled = { marker, entry: navigationEntryIndex() };
}

/** How many entries the traversal that landed on `state` moved, from where Media was (negative is Back). */
function deltaTo(state: unknown, from: Position): number {
  const to = markerOf(state);
  if (to && to.lineage === from.marker.lineage) return to.index - from.marker.index;
  const entry = navigationEntryIndex();
  if (entry !== null && from.entry !== null) return entry - from.entry;
  return -(from.marker.index + 1);
}

function isAt(state: unknown, position: Position): boolean {
  const here = markerOf(state);
  if (here) return here.lineage === position.marker.lineage && here.index === position.marker.index;
  const entry = navigationEntryIndex();
  return entry !== null && position.entry !== null && entry === position.entry;
}

/**
 * Guards browser Back and Forward while `dirty()` is true. `ask(proceed)`
 * puts the unsaved-changes question to the reader; calling `proceed` carries
 * out the traversal they asked for. `location` is the address's query: when
 * it changes (any move within Media, however it happened) the guard re-reads
 * where the browser is.
 */
export function useMediaHistoryGuard({ dirty, ask, location }: { dirty: () => boolean; ask: (proceed: () => void) => void; location: string }) {
  const latest = useRef({ dirty, ask });
  useEffect(() => { latest.current = { dirty, ask }; });

  useEffect(() => { adopt(); }, [location]);

  useEffect(() => {
    // The traversal being undone, and how many corrections it has taken.
    let undoing: { intent: number; steps: number } | null = null;
    // The next `popstate` is the replay of a traversal the reader approved.
    let replaying = false;

    const onPopState = (event: PopStateEvent) => {
      if (replaying) {
        replaying = false;
        const marker = markerOf(event.state);
        settled = marker ? { marker, entry: navigationEntryIndex() } : null;
        return;
      }
      const home = settled ?? adopt();

      if (undoing) {
        event.stopImmediatePropagation();
        if (isAt(event.state, home) || undoing.steps >= MAX_CORRECTIONS) {
          const { intent } = undoing;
          undoing = null;
          latest.current.ask(() => {
            replaying = true;
            window.history.go(intent);
          });
          return;
        }
        undoing.steps += 1;
        window.history.go(-deltaTo(event.state, home));
        return;
      }

      if (!latest.current.dirty()) {
        const marker = markerOf(event.state);
        settled = marker ? { marker, entry: navigationEntryIndex() } : null;
        return;
      }
      const delta = deltaTo(event.state, home);
      if (delta === 0) return;
      event.stopImmediatePropagation();
      undoing = { intent: delta, steps: 1 };
      window.history.go(-delta);
    };

    window.addEventListener("popstate", onPopState, { capture: true });
    return () => window.removeEventListener("popstate", onPopState, { capture: true });
  }, []);
}
