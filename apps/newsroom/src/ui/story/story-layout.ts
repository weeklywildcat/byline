"use client";

import { useAuth, usePreferences } from "@payloadcms/ui";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { normalizeStoryLayout, STORY_LAYOUT_PREFERENCE_KEY, type StoryLayout } from "./story-layout-model";

export type { StoryLayout } from "./story-layout-model";

/**
 * The legacy Story layout preference (docs/story-screen.md#legacy-layout).
 *
 * `focused` is the default Story: header, article and Story Context, with
 * Reporting, Review and History as focused modes. `tabs` is the older
 * arrangement some writers prefer while they get used to it: the same header
 * over Write / Plan / Production / History tabs. Only the arrangement
 * differs; the lifecycle, review and publishing rules are the same.
 *
 * Stored in Payload Preferences, like Stories saved views and the Calendar's
 * remembered view: the signed-in account's own admin UI state, kept per user.
 * No Users field, no migration, no Byline endpoint. Every read is normalized.
 */
// One value for the whole page: the account menu and the Story screen share it,
// and it survives client-side navigation between Stories (so only the first
// Story opened after a full page load can show the default for a moment).
let current: StoryLayout = "focused";
let loadedFor: string | null = null;
let loadingFor: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Test seam: forget what was loaded. */
export function resetStoryLayout() {
  current = "focused";
  loadedFor = null;
  loadingFor = null;
  emit();
}

export function useStoryLayout(): { layout: StoryLayout; setLayout: (layout: StoryLayout) => void } {
  const { user } = useAuth();
  const { getPreference, setPreference } = usePreferences();
  const account = user?.id == null ? "" : String(user.id);
  const layout = useSyncExternalStore(subscribe, () => current, () => "focused" as StoryLayout);

  useEffect(() => {
    if (!account || loadedFor === account || loadingFor === account) return;
    loadingFor = account;
    void getPreference<unknown>(STORY_LAYOUT_PREFERENCE_KEY)
      .then((stored) => {
        // A choice made while this was loading wins over what was stored.
        if (loadedFor === account || loadingFor !== account) return;
        loadedFor = account;
        current = normalizeStoryLayout(stored);
        emit();
      })
      .catch(() => {
        if (loadingFor === account) loadedFor = account;
      });
  }, [account, getPreference]);

  const setLayout = useCallback(
    (next: StoryLayout) => {
      loadedFor = account || loadedFor;
      current = next;
      emit();
      // A layout is a convenience: if it can't be saved it still applies until reload.
      void setPreference(STORY_LAYOUT_PREFERENCE_KEY, { layout: next }).catch(() => undefined);
    },
    [account, setPreference]
  );

  return { layout, setLayout };
}
