"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, EDITORS_NOTE_LABEL, EXPANDABLE_HEADING_SUGGESTIONS } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { ComparisonView, EditorsNoteView, ExpandableView, KeyNumbersView, MarginNoteView } from "@byline/ui/article-body";
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { newRowId } from "../../fields";
import { insertItem, moveDirection, moveItem, removeItem } from "../../items";
import { BlockShell, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce } from "../host";
import { ParagraphFields, usePrivilegedNode } from "./parts";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

/** The editors' voice. Only editors and administrators write it; staff see it read-only. */
export function EditorsNoteEditor({ node: rawNode, id, nodeKey }: BlockEditorProps) {
  const node = usePrivilegedNode(rawNode);
  const [fields, set] = useTypedFields("editorsNote", node);
  const issues = useReadiness("editorsNote", id, node.fields);
  const body = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, body);
  return (
    <BlockShell type="editorsNote" node={node} issues={issues}>
      <EditorsNoteView label={EDITORS_NOTE_LABEL}>
        <ParagraphFields inputRef={body} label="Editor's note" placeholder="What the editors want readers to know." value={fields.body} readOnly={!node.editable} onChange={(value) => set({ body: value.slice(0, LIMITS.noteBody) })} />
      </EditorsNoteView>
    </BlockShell>
  );
}

export function MarginNoteEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("marginNote", node);
  const issues = useReadiness("marginNote", id, node.fields);
  const body = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, body);
  const readOnly = !node.editable;
  return (
    <BlockShell type="marginNote" node={node} issues={issues}>
      <MarginNoteView heading={<InlineText className="byline-context-heading" label="Heading (optional)" placeholder="Heading (optional)" value={fields.heading} maxLength={LIMITS.heading} readOnly={readOnly} onEnter={() => body.current?.focus()} onChange={(heading) => set({ heading })} />}>
        <ParagraphFields inputRef={body} label="Margin note" placeholder="Extra information that should not interrupt the story." value={fields.body} readOnly={readOnly} onChange={(value) => set({ body: value.slice(0, LIMITS.noteBody) })} />
      </MarginNoteView>
    </BlockShell>
  );
}

export function ExpandableEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("expandable", node);
  const issues = useReadiness("expandable", id, node.fields);
  const heading = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, heading);
  const readOnly = !node.editable;
  return (
    <BlockShell
      type="expandable"
      node={node}
      issues={issues}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
            Heading
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {EXPANDABLE_HEADING_SUGGESTIONS.map((suggestion) => <DropdownMenuItem key={suggestion} onClick={() => set({ heading: suggestion })}>{suggestion}</DropdownMenuItem>)}
            <DropdownMenuItem onClick={() => heading.current?.focus()}>Write your own…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <ExpandableView editing heading={<InlineText inputRef={heading} label="What readers click" placeholder="Methodology, the full statement, more details…" value={fields.heading} maxLength={LIMITS.expandableHeading} readOnly={readOnly} onEnter={() => body.current?.focus()} onChange={(value) => set({ heading: value })} />}>
        <ParagraphFields scope=".byline-expandable-body" inputRef={body} label="Details" placeholder="What opens. Not anything a reader needs to follow the story." value={fields.body} readOnly={readOnly} onChange={(value) => set({ body: value.slice(0, LIMITS.expandableBody) })} />
      </ExpandableView>
    </BlockShell>
  );
}

export function ComparisonEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("comparison", node);
  const issues = useReadiness("comparison", id, node.fields);
  const announce = useAnnounce();
  const first = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, first);
  const readOnly = !node.editable;
  const swap = () => {
    set({ leftLabel: fields.rightLabel, leftTitle: fields.rightTitle, leftBody: fields.rightBody, rightLabel: fields.leftLabel, rightTitle: fields.leftTitle, rightBody: fields.leftBody });
    announce("Sides swapped.");
  };
  const side = (name: "left" | "right") => {
    const label = `${name}Label` as const;
    const title = `${name}Title` as const;
    const body = `${name}Body` as const;
    return (
      <>
        <InlineText inputRef={name === "left" ? first : undefined} className="byline-kicker" label={`${name === "left" ? "Left" : "Right"} label`} placeholder={name === "left" ? "Current" : "Proposed"} value={fields[label]} maxLength={LIMITS.comparisonLabel} readOnly={readOnly} onChange={(value) => set({ [label]: value })} />
        <h3><InlineText label={`${name === "left" ? "Left" : "Right"} title`} placeholder="Title" value={fields[title]} maxLength={LIMITS.comparisonTitle} readOnly={readOnly} onChange={(value) => set({ [title]: value })} /></h3>
        <ParagraphFields scope=".byline-compare-side" label={`${name === "left" ? "Left" : "Right"} side`} placeholder="Explain this side in a few sentences." value={fields[body]} readOnly={readOnly} onChange={(value) => set({ [body]: value.slice(0, LIMITS.comparisonBody) })} />
      </>
    );
  };
  return (
    <BlockShell type="comparison" node={node} issues={issues} actions={<ButtonGroup><ToolTextButton label="Swap sides" icon={<ArrowLeftRight />} onClick={swap} /></ButtonGroup>}>
      <ComparisonView
        headingId={`${id}-heading`}
        heading={<InlineText label="Heading (optional)" placeholder="Heading (optional)" value={fields.heading} maxLength={LIMITS.heading} readOnly={readOnly} onChange={(heading) => set({ heading })} />}
        left={side("left")}
        right={side("right")}
      />
    </BlockShell>
  );
}

export function KeyNumbersEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("keyNumbers", node);
  const issues = useReadiness("keyNumbers", id, node.fields);
  const announce = useAnnounce();
  const first = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, first);
  const readOnly = !node.editable;
  const items = fields.items;
  const full = items.length >= LIMITS.keyNumbersMax;
  const root = () => node.editor.getElementByKey(nodeKey);
  const focusItem = (index: number, part = "value") => focusIn(root(), `.byline-key-numbers dl > :nth-child(${index + 1}) [data-part="${part}"] .byline-field`);

  const apply = (change: { items: typeof items; focus: number }, message?: string) => {
    set({ items: change.items });
    if (message) announce(`${message} ${change.focus + 1} of ${change.items.length}.`);
    focusItem(change.focus);
  };
  const add = () => !full && apply(insertItem(items, items.length, { id: newRowId(), value: "", label: "", context: "" }, LIMITS.keyNumbersMax), "Number added.");
  const edit = (index: number, patch: Partial<(typeof items)[number]>) => set({ items: items.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  return (
    <BlockShell type="keyNumbers" node={node} issues={issues} actions={<ButtonGroup><ToolTextButton label="Add number" icon={<Plus />} disabled={full} onClick={add} /></ButtonGroup>}>
      <KeyNumbersView
        headingId={`${id}-heading`}
        heading={<InlineText label="Heading (optional)" placeholder="Heading (optional)" value={fields.heading} maxLength={LIMITS.heading} readOnly={readOnly} onChange={(heading) => set({ heading })} />}
        source={<InlineText label="Shared source (optional)" placeholder="Source (optional)" value={fields.source} maxLength={LIMITS.keyNumbersSource} readOnly={readOnly} onChange={(source) => set({ source })} />}
        items={items.map((item, index) => ({
          key: item.id,
          value: <span data-part="value"><InlineText inputRef={index === 0 ? first : undefined} label={`Number ${index + 1} of ${items.length}`} placeholder="1,400" value={item.value} maxLength={LIMITS.keyNumberValue} readOnly={readOnly} onEnter={() => focusItem(index, "label")} onChange={(value) => edit(index, { value })} onKeyDown={(event) => {
            const direction = moveDirection(event);
            if (direction) {
              event.preventDefault();
              apply(moveItem(items, index, direction), "Number moved.");
            }
          }} /></span>,
          label: <span data-part="label"><InlineText label={`What number ${index + 1} counts`} placeholder="What it counts" value={item.label} maxLength={LIMITS.keyNumberLabel} readOnly={readOnly} onEnter={() => focusItem(index, "context")} onChange={(label) => edit(index, { label })} /></span>,
          context: <span data-part="context"><InlineText label={`Context for number ${index + 1} (optional)`} placeholder="Context (optional)" value={item.context} maxLength={LIMITS.keyNumberContext} readOnly={readOnly} onEnter={() => (index + 1 < items.length ? focusItem(index + 1) : add())} onChange={(context) => edit(index, { context })} /></span>,
          actions: readOnly ? null : (
            <ButtonGroup className="byline-row-actions" aria-label={`Number ${index + 1} actions`} data-byline-chrome="">
              <ToolButton label="Move earlier" disabled={index === 0} onClick={() => apply(moveItem(items, index, -1), "Number moved.")}><ArrowUp /></ToolButton>
              <ToolButton label="Move later" disabled={index === items.length - 1} onClick={() => apply(moveItem(items, index, 1), "Number moved.")}><ArrowDown /></ToolButton>
              <ToolButton label="Remove number" disabled={items.length <= LIMITS.keyNumbersMin} onClick={() => apply(removeItem(items, index), "Number removed.")}><Trash2 /></ToolButton>
            </ButtonGroup>
          )
        }))}
      />
    </BlockShell>
  );
}
