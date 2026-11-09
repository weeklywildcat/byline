"use client";

import { useSyncExternalStore } from "react";

/**
 * What the app header's breadcrumb needs to know about the open Story, which
 * only the Story screen knows: its live headline, and, in a focused mode
 * (Reporting, Review, History), the mode's name and the way back to the Story.
 * The Story screen publishes it while it is mounted; the header reads it.
 * Nothing here is saved or sent anywhere.
 */
export type StoryCrumb = { id: number; title: string; mode: string | null; openStory: (() => void) | null };

let current: StoryCrumb | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Publish (or, with null, withdraw) the open Story's crumb. */
export function setStoryCrumb(next: StoryCrumb | null) {
  const same = current === next || (current && next && current.id === next.id && current.title === next.title && current.mode === next.mode && current.openStory === next.openStory);
  if (same) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** The open Story's crumb, only while it is the Story whose screen this is. */
export function useStoryCrumb(storyId: number | null): StoryCrumb | null {
  const value = useSyncExternalStore(subscribe, () => current, () => null);
  return storyId !== null && value?.id === storyId ? value : null;
}
