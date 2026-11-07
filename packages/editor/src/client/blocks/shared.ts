"use client";

import { blockIssues, mediaKey, type ArticleBlock, type ArticleBlockType, type ArticleMediaAsset, type BlockIssue, type MediaId } from "@byline/article-body";
import { useCallback, useMemo, useSyncExternalStore } from "react";
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
 * same rules publishing uses. While a referenced asset is still loading
 * nothing is reported, so a block never flashes a false warning.
 */
export function useReadiness<K extends ArticleBlockType>(type: K, id: string, raw: unknown): readonly BlockIssue[] {
  const { store } = useBylineEditorHost();
  const snapshot = useCallback(() => {
    const block = articleBlockFromFields(type, id, raw) as ArticleBlock;
    const ids: MediaId[] = [];
    if ("media" in block && block.media !== null) ids.push(block.media);
    if (block.type === "gallery") for (const item of block.items) if (item.media !== null) ids.push(item.media);
    const entries = new Map<string, ArticleMediaAsset | null>();
    for (const mediaId of ids) {
      const entry = store.get(mediaId);
      if (entry.status === "loading") return "[]";
      entries.set(mediaKey(mediaId), entry.asset);
    }
    return JSON.stringify(blockIssues(block, (mediaId) => entries.get(mediaKey(mediaId)) ?? null));
  }, [id, raw, store, type]);
  const json = useSyncExternalStore(store.subscribe, snapshot, snapshot);
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
