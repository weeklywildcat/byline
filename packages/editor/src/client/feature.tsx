"use client";

import { articleBlockFrameClassName, articleBlockPlacement } from "@byline/ui/article-body";
import { isArticleBlockType, type Placement } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { BlockNode, createClientFeature, INSERT_BLOCK_COMMAND, InlineBlockNode } from "@payloadcms/richtext-lexical/client";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type LexicalEditor
} from "@payloadcms/richtext-lexical/lexical";
import { useLexicalComposerContext } from "@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@payloadcms/richtext-lexical/lexical/react/useLexicalEditable";
import { mergeRegister } from "@payloadcms/richtext-lexical/lexical/utils";
import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { markCreated } from "./focus";
import { AddBlockBar, AddBlockMenu } from "./inserter";

/** The body element is the article's: the shared CSS styles it as `.article-body`. */
const ROOT_CLASSES = ["article-body", "byline-article-canvas-body"];
const FRAME_CLASS = /^(?:byline-block(?:-.+)?|alignwide|alignfull)$/;

const isHistoryKey = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase());

/**
 * Byline's part of the editor, mounted inside Lexical:
 *
 * - the contenteditable root becomes the article's `.article-body`, so prose
 *   uses the literal public CSS;
 * - each block node's element gets the block frame classes the public
 *   renderer puts on its frame (`.byline-block byline-block-photo alignwide`),
 *   so breakouts and spacing are the same rules;
 * - keystrokes in a block's own fields stay with those fields (Lexical keeps
 *   Undo/Redo), so Enter, Backspace or arrows never edit the story around it;
 * - blocks created while writing are marked to take focus, and until one
 *   appears (Payload builds a new block's form state on the server first) the
 *   story has no caret, so quick typing never lands in the paragraph below.
 */
function BylineCanvasPlugin() {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => mergeRegister(
    editor.registerRootListener((root, previous) => {
      previous?.classList.remove(...ROOT_CLASSES);
      root?.classList.add(...ROOT_CLASSES);
    }),
    editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
      const target = event.target instanceof Element ? event.target : null;
      // Inside a block (its fields, buttons and toggles) or Byline's chrome, keys belong to that
      // control. A block selected as a whole (focus on the story itself) still deletes with Backspace.
      if (!target?.closest(".byline-block, [data-byline-chrome]")) return false;
      // Handled: Lexical's own key handling never runs there; the browser's does.
      return !isHistoryKey(event);
    }, COMMAND_PRIORITY_CRITICAL),
    editor.registerMutationListener(BlockNode, (mutations) => {
      for (const [key, mutation] of mutations) {
        if (mutation === "destroyed") continue;
        applyFrame(editor, key);
      }
    }, { skipInitialization: false }),
    editor.registerMutationListener(BlockNode, (mutations) => {
      for (const [key, mutation] of mutations) if (mutation === "created") markCreated(key);
    }, { skipInitialization: true }),
    // A new footnote reference opens its note at once.
    editor.registerMutationListener(InlineBlockNode, (mutations) => {
      for (const [key, mutation] of mutations) if (mutation === "created") markCreated(key);
    }, { skipInitialization: true }),
    // Runs before Payload's own handler (higher priority) and lets it insert (returns false).
    editor.registerCommand(INSERT_BLOCK_COMMAND, () => {
      window.setTimeout(() => {
        editor.update(() => $setSelection(null));
        editor.getRootElement()?.blur();
      });
      return false;
    }, COMMAND_PRIORITY_HIGH)
  ), [editor]);

  return null;
}

function applyFrame(editor: LexicalEditor, key: string) {
  const element = editor.getElementByKey(key);
  if (!element) return;
  const frame = editor.getEditorState().read(() => {
    const fields = ($getNodeByKey(key) as BlockNode | null)?.getFields() as { blockType?: unknown; placement?: unknown } | undefined;
    const type = fields?.blockType;
    if (!isArticleBlockType(type)) return null;
    return articleBlockFrameClassName(type, articleBlockPlacement({ type, placement: fields?.placement as Placement | undefined }));
  });
  for (const name of [...element.classList]) if (FRAME_CLASS.test(name)) element.classList.remove(name);
  if (frame) element.classList.add(...frame.split(" "));
}

/**
 * The desktop "+" beside the paragraph the writer is in: the Add menu for
 * that spot. It follows the caret (not the mouse), so it is where keyboard
 * writers are too; touch writers use the Add bar instead.
 */
function GutterInserterPlugin({ anchorElem }: { anchorElem: HTMLElement }) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [position, setPosition] = useState<{ top: number; empty: boolean } | null>(null);

  useEffect(() => {
    const update = () => {
      const next = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return null;
        const top = selection.anchor.getNode().getTopLevelElement();
        if (!top) return null;
        const element = editor.getElementByKey(top.getKey());
        if (!element) return null;
        const anchor = anchorElem.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 28;
        return { top: rect.top - anchor.top + Math.min(rect.height, lineHeight) / 2, empty: top.getTextContent() === "" };
      });
      setPosition(next);
    };
    return mergeRegister(editor.registerUpdateListener(update), editor.registerRootListener(() => update()));
  }, [anchorElem, editor]);

  if (!editable || !position) return null;
  return (
    <div className="byline-gutter-inserter" data-empty={position.empty || undefined} style={{ top: `${position.top}px` }} data-byline-chrome="">
      <AddBlockMenu
        editor={editor}
        trigger={
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Add a photo, quote or other story tool here" onMouseDown={(event) => event.preventDefault()}>
            <Plus />
          </Button>
        }
      />
    </div>
  );
}

function AddBarPlugin() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  return editable ? <AddBlockBar editor={editor} /> : null;
}

// Payload's selection toolbar renders an item's ChildComponent alone inside an unlabelled
// button, so each icon carries the button's name for assistive technology.
const VISUALLY_HIDDEN = { border: 0, clip: "rect(0 0 0 0)", height: 1, margin: -1, overflow: "hidden", padding: 0, position: "absolute", whiteSpace: "nowrap", width: 1 } as const;
const FootnoteIcon = () => <><span aria-hidden="true" style={{ fontWeight: 700 }}>1</span><span style={VISUALLY_HIDDEN}>Footnote</span></>;
const SourceIcon = () => <><span aria-hidden="true" style={{ fontWeight: 700 }}>[1]</span><span style={VISUALLY_HIDDEN}>Source</span></>;

/** A 24-hex id, the shape Payload gives inline blocks it creates. */
function inlineBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Puts a Footnote or Source reference after the claim it supports: at the caret, or after
 * the selected words (which stay; Payload's insert command would replace them). Byline
 * inserts the node itself rather than through Payload's command, which also opens Payload's
 * generic block drawer for a new inline block; the reference's own Popover opens instead
 * (`markCreated` below).
 */
function insertReference(editor: LexicalEditor, fields: Record<string, unknown>): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    if (!selection.isCollapsed()) {
      const end = selection.isBackward() ? selection.anchor : selection.focus;
      selection.anchor.set(end.key, end.offset, end.type);
      selection.focus.set(end.key, end.offset, end.type);
    }
    $insertNodes([$applyNodeReplacement(new InlineBlockNode({ fields: { id: inlineBlockId(), blockName: "", ...fields } as never }))]);
  });
}

export const BylineCanvasFeatureClient = createClientFeature({
  // "Footnote" and "Source" beside Bold, Italic and Link in the selection toolbar. The reference goes where the caret is.
  toolbarInline: {
    groups: [
      {
        type: "buttons",
        key: "bylineFootnote",
        order: 70,
        items: [
          {
            key: "footnote",
            label: "Footnote",
            ChildComponent: FootnoteIcon,
            isActive: () => false,
            onSelect: ({ editor }) => {
              insertReference(editor, { blockType: "footnote" });
            },
            order: 1
          },
          {
            key: "source",
            label: "Source",
            ChildComponent: SourceIcon,
            isActive: () => false,
            onSelect: ({ editor }) => {
              insertReference(editor, { blockType: "source", kind: "web" });
            },
            order: 2
          }
        ]
      }
    ]
  },
  plugins: [
    { Component: BylineCanvasPlugin, position: "normal" },
    // Hidden on touch by canvas.css: touch writers use the Add bar.
    { Component: GutterInserterPlugin, position: "floatingAnchorElem" },
    { Component: AddBarPlugin, position: "belowContainer" }
  ]
});
