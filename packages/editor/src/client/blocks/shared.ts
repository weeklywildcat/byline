"use client";

import { blockDataProjectIds, blockEventIds, blockIssues, blockMediaIds, blockPollIds, blockStoryIds, mediaKey, type ArticleBlock, type ArticleBlockType, type ArticleMediaAsset, type BlockIssue, type MediaId, type PublicEventReference, type PublicPollReference, type PublicStoryReference } from "@byline/article-body";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { dataProjectPublishable } from "../../data-project";
import { articleBlockFromFields, BLOCK_FIELD_READERS, type BylineBlockFields } from "../../fields";
import { useBylineEditorHost } from "../host";
import type { useBlockNode } from "../lexical";

export type BlockNodeApi = ReturnType<typeof useBlockNode>;
export type BlockEditorProps = { node: BlockNodeApi; id: string; nodeKey: string };

/** A block's stored fields, typed, and a setter that writes the whole normalized block back. */
export function useTypedFields<K extends ArticleBlockType>(type: K, node: BlockNodeApi) {
  const read = BLOCK_FIELD_READERS[type] as (raw: unknown) => BylineBlockFields[K];
  const fields = useMemo(() => read(node.fields), [node.fields, read]);
  const set = useCallback((patch: Partial<BylineBlockFields[K]>) => {
    node.write((raw) => ({ ...raw, ...read(raw), ...patch }));
  }, [node, read]);
  return [fields, set] as const;
}

const NONE: readonly BlockIssue[] = [];

/**
 * What keeps this block (or part of it) out of the published story, by the
 * same rules publishing uses. While a record the block names (Media, a Story, a
 * Poll) is still loading nothing is reported, so a block never flashes a false
 * warning.
 */
export function useReadiness<K extends ArticleBlockType>(type: K, id: string, raw: unknown): readonly BlockIssue[] {
  const { store, stories, polls, events, dataProjects, interactives, trackers } = useBylineEditorHost();
  const subscribe = useCallback((listener: () => void) => {
    const stops = [store.subscribe(listener), stories.subscribe(listener), polls.subscribe(listener), events.subscribe(listener), dataProjects.subscribe(listener)];
    return () => stops.forEach((stop) => stop());
  }, [dataProjects, events, polls, stories, store]);
  const snapshot = useCallback(() => {
    const block = articleBlockFromFields(type, id, raw) as ArticleBlock;
    const media = new Map<string, ArticleMediaAsset | null>();
    const storyFacts = new Map<string, PublicStoryReference | null>();
    const pollFacts = new Map<string, PublicPollReference | null>();
    const eventFacts = new Map<string, PublicEventReference | null>();
    const dataProjectFacts = new Map<string, { id: MediaId } | null>();
    for (const projectId of blockDataProjectIds(block)) {
      const entry = dataProjects.get(projectId);
      if (entry.status === "loading") return "[]";
      // A draft-only project has no published version: it cannot publish, whatever the picker shows.
      dataProjectFacts.set(mediaKey(projectId), entry.asset && dataProjectPublishable(entry.asset.publication) ? { id: entry.asset.id } : null);
    }
    for (const eventId of blockEventIds(block)) {
      const entry = events.get(eventId);
      if (entry.status === "loading") return "[]";
      eventFacts.set(mediaKey(eventId), entry.asset);
    }
    for (const mediaId of blockMediaIds(block)) {
      const entry = store.get(mediaId);
      if (entry.status === "loading") return "[]";
      media.set(mediaKey(mediaId), entry.asset);
    }
    for (const storyId of blockStoryIds(block)) {
      const entry = stories.get(storyId);
      if (entry.status === "loading") return "[]";
      storyFacts.set(mediaKey(storyId), entry.asset);
    }
    for (const pollId of blockPollIds(block)) {
      const entry = polls.get(pollId);
      if (entry.status === "loading") return "[]";
      // A draft poll is not public: it never counts as chosen.
      pollFacts.set(mediaKey(pollId), entry.asset && entry.asset.status !== "draft" ? entry.asset : null);
    }
    return JSON.stringify(blockIssues(block, (mediaId) => media.get(mediaKey(mediaId)) ?? null, {
      story: (storyId) => storyFacts.get(mediaKey(storyId)) ?? null,
      poll: (pollId) => pollFacts.get(mediaKey(pollId)) ?? null,
      event: (eventId) => eventFacts.get(mediaKey(eventId)) ?? null,
      dataProject: (projectId) => dataProjectFacts.get(mediaKey(projectId)) ?? null,
      interactive: (key) => Boolean(interactives?.some((entry) => entry.key === key)),
      tracker: (key) => Boolean(trackers?.some((entry) => entry.key === key))
    }));
  }, [dataProjects, events, id, interactives, polls, raw, stories, store, trackers, type]);
  const json = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => (json === "[]" ? NONE : (JSON.parse(json) as BlockIssue[])), [json]);
}

function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: false });
  if (element instanceof HTMLTextAreaElement) element.setSelectionRange(element.value.length, element.value.length);
}

/**
 * Focus a field inside this block. After a change to the list (add, move,
 * remove) it waits a frame for the re-render; moving between fields that are
 * already there (`now`) happens at once, so the next keystroke lands in the
 * right field however fast it comes.
 */
export function focusIn(root: HTMLElement | null, selector: string, now = false): void {
  if (now) {
    const element = root?.querySelector<HTMLElement>(selector);
    if (element) return focusElement(element);
  }
  window.requestAnimationFrame(() => {
    const element = root?.querySelector<HTMLElement>(selector);
    if (element) focusElement(element);
  });
}
