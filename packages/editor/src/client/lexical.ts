"use client";

import { $isBlockNode, $isInlineBlockNode, INSERT_BLOCK_COMMAND } from "@payloadcms/richtext-lexical/client";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getPreviousSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  SKIP_DOM_SELECTION_TAG,
  type LexicalEditor,
  type LexicalNode
} from "@payloadcms/richtext-lexical/lexical";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@payloadcms/richtext-lexical/lexical/react/useLexicalEditable";
import type { ArticleBlockType } from "@byline/article-body";
import { useCallback, useSyncExternalStore } from "react";

/**
 * The Lexical block node is the only copy of a block's content. Block editors
 * read its fields and write them back with `node.setFields` inside ordinary
 * Lexical updates, so Payload's RichText field sees every change (and
 * autosaves it) and Lexical's own history undoes it. There is no second
 * document model and no per-block save.
 */

type Fields = Record<string, unknown>;

/**
 * Never tag these updates `history-merge`: Payload feeds its form from
 * Lexical's OnChangePlugin, which skips history-merge updates, so a merged
 * edit would never reach the form (and never autosave). Every write is an
 * ordinary update; undo is therefore per edit, not per typing burst.
 */
export function writeBlockFields(editor: LexicalEditor, nodeKey: string, update: (fields: Fields) => Fields): void {
  editor.update(
    () => {
      const node = $getNodeByKey(nodeKey);
      // `true`: the node keeps its form-state cache, so Payload does not refetch and remount the block.
      if ($isBlockNode(node)) node.setFields({ ...update(node.getFields() as Fields) } as never, true);
    },
    // Discrete: the input's value is the node's value, committed before React re-renders it.
    // SKIP_DOM_SELECTION: the caret stays in the block's own field.
    { discrete: true, tag: [SKIP_DOM_SELECTION_TAG] }
  );
}

/** A block node's stored fields, its editability, and the edits Byline's block chrome makes. */
export function useBlockNode(nodeKey: string) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const read = useCallback(() => editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    return $isBlockNode(node) ? (node.getFields() as Fields) : null;
  }), [editor, nodeKey]);
  const fields = useSyncExternalStore(useCallback((listener) => editor.registerUpdateListener(listener), [editor]), read, read);
  const position = useSyncExternalStore(useCallback((listener) => editor.registerUpdateListener(listener), [editor]), useCallback(() => editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!node) return "none";
    const previous = node.getPreviousSibling() !== null;
    const next = node.getNextSibling() !== null;
    return previous && next ? "middle" : previous ? "last" : next ? "first" : "only";
  }), [editor, nodeKey]));

  const write = useCallback((update: (fields: Fields) => Fields) => {
    if (!editor.isEditable()) return;
    writeBlockFields(editor, nodeKey, update);
  }, [editor, nodeKey]);

  const remove = useCallback(() => {
    if (!editor.isEditable()) return;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!node) return;
      // Leave the caret where the block was, so writing continues there.
      const next = node.getNextSibling() ?? node.getPreviousSibling();
      node.remove();
      if (next && "selectStart" in next) (next as LexicalNode & { selectStart: () => void }).selectStart();
      else if (!next) $getRoot().append($createParagraphNode()).selectEnd();
    });
  }, [editor, nodeKey]);

  const move = useCallback((direction: -1 | 1) => {
    if (!editor.isEditable()) return false;
    let moved = false;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      const sibling = direction < 0 ? node?.getPreviousSibling() : node?.getNextSibling();
      if (!node || !sibling) return;
      if (direction < 0) sibling.insertBefore(node);
      else sibling.insertAfter(node);
      moved = true;
    }, { discrete: true });
    return moved;
  }, [editor, nodeKey]);

  return { editor, fields, editable, position, write, remove, move };
}

/**
 * Inserts a Byline block where the writer is: at the caret, after a selected
 * block, or at the end of the story when nothing is selected. Insertion
 * itself is Payload's (`INSERT_BLOCK_COMMAND`), the same command the slash
 * menu runs, so both paths create identical nodes.
 */
export function insertStoryBlock(editor: LexicalEditor, type: ArticleBlockType): void {
  editor.update(() => {
    const selection = $getSelection() ?? $getPreviousSelection();
    if ($isNodeSelection(selection)) {
      // A selected block: the new one goes right after it.
      const node = selection.getNodes()[0];
      const top = node ? (node.getParent() === $getRoot() ? node : node.getTopLevelElement() ?? node) : null;
      if (top) {
        const after = $createParagraphNode();
        top.insertAfter(after);
        after.select();
      }
    } else if (!$isRangeSelection(selection)) {
      const root = $getRoot();
      const last = root.getLastChild();
      // Insert into an empty last paragraph when there is one; otherwise add one at the end.
      if (last && last.getType() === "paragraph" && last.getTextContent() === "") (last as LexicalNode & { select: () => void }).select();
      else root.append($createParagraphNode()).selectEnd();
    }
  }, { discrete: true });
  editor.dispatchCommand(INSERT_BLOCK_COMMAND, { blockName: "", blockType: type });
}

/** Whether the editor is editable now (false while another user holds the story's lock). */
export function useCanvasEditable(): boolean {
  return useLexicalEditable();
}

/** Every footnote reference in reading order. Numbers are never stored: they are positions in this list. */
function $footnoteKeys(): string[] {
  const keys: string[] = [];
  const visit = (node: LexicalNode) => {
    if ($isInlineBlockNode(node)) {
      if ((node.getFields() as Fields).blockType === "footnote") keys.push(node.getKey());
      return;
    }
    if ($isElementNode(node)) node.getChildren().forEach(visit);
  };
  visit($getRoot());
  return keys;
}

/**
 * One footnote reference: its note, its derived number (the position among all
 * references in the story) and the edits it makes. Like a block, the node is
 * the only copy of its content and writes are ordinary Lexical updates, so
 * undo, autosave and history cover footnotes too.
 */
export function useFootnote(nodeKey: string) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const subscribe = useCallback((listener: () => void) => editor.registerUpdateListener(listener), [editor]);
  const read = useCallback(() => editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!$isInlineBlockNode(node)) return "null";
    const keys = $footnoteKeys();
    return JSON.stringify({ text: ((node.getFields() as Fields).text as string) ?? "", number: keys.indexOf(nodeKey) + 1 });
  }), [editor, nodeKey]);
  const json = useSyncExternalStore(subscribe, read, read);
  const state = json === "null" ? null : (JSON.parse(json) as { text: string; number: number });

  const write = useCallback((text: string) => {
    if (!editor.isEditable()) return;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isInlineBlockNode(node)) node.setFields({ ...(node.getFields() as Fields), text } as never, true);
    }, { discrete: true, tag: [SKIP_DOM_SELECTION_TAG] });
  }, [editor, nodeKey]);

  const remove = useCallback(() => {
    if (!editor.isEditable()) return;
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });
  }, [editor, nodeKey]);

  return { editor, editable, text: state?.text ?? "", number: state?.number ?? 0, write, remove };
}
