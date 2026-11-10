"use client";

import { useAuth, usePreferences } from "@payloadcms/ui";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { StoryWorkspace } from "./story-view";
import { normalizeWorkspaceMemory, rememberedWorkspace, rememberWorkspace, STORY_WORKSPACE_PREFERENCE_KEY, type WorkspaceMemory } from "./story-workspace-memory-model";

/**
 * The workspace (Plan or Write) this reader last used on each Story, so an
 * established draft reopens where they were working (docs/story-screen.md#default).
 *
 * Reader UI state, kept like Stories saved views: Payload Preferences under a
 * versioned key, per account, normalized on read. No Users field, migration
 * or Byline endpoint. Loaded once per page and shared by every Story opened
 * after it.
 */
type State = { memory: WorkspaceMemory; loaded: boolean };
let state: State = { memory: [], loaded: false };
let loadedFor: string | null = null;
let loadingFor: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const SERVER: State = { memory: [], loaded: false };

/** Test seam: forget what was loaded. */
export function resetWorkspaceMemory() {
  state = { memory: [], loaded: false };
  loadedFor = null;
  loadingFor = null;
  emit();
}

export function useWorkspaceMemory(storyId: number | null): { loaded: boolean; remembered: StoryWorkspace | null; remember: (workspace: StoryWorkspace) => void } {
  const { user } = useAuth();
  const { getPreference, setPreference } = usePreferences();
  const account = user?.id == null ? "" : String(user.id);
  const current = useSyncExternalStore(subscribe, () => state, () => SERVER);

  useEffect(() => {
    if (!account || loadedFor === account || loadingFor === account) return;
    loadingFor = account;
    void getPreference<unknown>(STORY_WORKSPACE_PREFERENCE_KEY)
      .then((stored) => {
        if (loadingFor !== account) return;
        loadedFor = account;
        // Anything remembered while this was loading is newer than what was stored.
        const merged = state.memory.reduceRight((memory, [id, workspace]) => rememberWorkspace(memory, id, workspace), normalizeWorkspaceMemory(stored));
        state = { memory: merged, loaded: true };
        emit();
      })
      .catch(() => {
        if (loadingFor !== account) return;
        loadedFor = account;
        state = { ...state, loaded: true };
        emit();
      });
  }, [account, getPreference]);

  const remember = useCallback((workspace: StoryWorkspace) => {
    if (storyId === null || rememberedWorkspace(state.memory, storyId) === workspace && state.memory[0]?.[0] === storyId) return;
    state = { ...state, memory: rememberWorkspace(state.memory, storyId, workspace) };
    emit();
    // A convenience: if it can't be saved it still applies until the page reloads.
    void setPreference(STORY_WORKSPACE_PREFERENCE_KEY, { stories: state.memory }).catch(() => undefined);
  }, [setPreference, storyId]);

  return { loaded: current.loaded || !account, remembered: storyId === null ? null : rememberedWorkspace(current.memory, storyId), remember };
}
