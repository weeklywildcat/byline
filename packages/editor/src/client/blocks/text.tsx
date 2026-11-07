"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, CONTEXT_HEADING_SUGGESTIONS, DEFAULT_HEADINGS } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { PullQuoteView, ReportedQuoteView, SupportingContext } from "@byline/ui/article-body";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { newRowId } from "../../fields";
import { insertItem, moveDirection, moveItem, removeItem } from "../../items";
import { BlockShell, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce } from "../host";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

export function ReportedQuoteEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("reportedQuote", node);
  const issues = useReadiness("reportedQuote", id, node.fields);
  const text = useRef<HTMLTextAreaElement>(null);
  const attribution = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, text);
  const readOnly = !node.editable;
  return (
    <BlockShell type="reportedQuote" node={node} issues={issues}>
      <ReportedQuoteView
        text={<InlineText inputRef={text} className="byline-quote-text" label="Quote" placeholder="Type the quote exactly as it was said." value={fields.text} maxLength={LIMITS.quote} readOnly={readOnly} multiline onEnter={() => attribution.current?.focus()} onChange={(value) => set({ text: value }, "text")} />}
        attribution={<InlineText inputRef={attribution} className="byline-quote-attribution" label="Who said it" placeholder="Name, title" value={fields.attribution} maxLength={LIMITS.attribution} readOnly={readOnly} onChange={(value) => set({ attribution: value }, "attribution")} />}
      />
    </BlockShell>
  );
}

export function PullQuoteEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("pullQuote", node);
  const issues = useReadiness("pullQuote", id, node.fields);
  const text = useRef<HTMLTextAreaElement>(null);
  const attribution = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, text);
  const readOnly = !node.editable;
  return (
    <BlockShell type="pullQuote" node={node} issues={issues}>
      <PullQuoteView
        text={<InlineText inputRef={text} className="byline-quote-text" label="Pull quote" placeholder="A line from the story worth repeating." value={fields.text} maxLength={LIMITS.quote} readOnly={readOnly} multiline onEnter={() => attribution.current?.focus()} onChange={(value) => set({ text: value }, "text")} />}
        attribution={<InlineText inputRef={attribution} className="byline-quote-attribution" label="Attribution (optional)" placeholder="Who said it (optional)" value={fields.attribution} maxLength={LIMITS.attribution} readOnly={readOnly} onChange={(value) => set({ attribution: value }, "attribution")} />}
      />
    </BlockShell>
  );
}

/** A renameable supporting-context heading, typed where the label prints. */
function ContextHeading({ value, fallback, readOnly, onChange, onEnter, inputRef }: { value: string; fallback: string; readOnly: boolean; onChange: (value: string) => void; onEnter: () => void; inputRef?: React.Ref<HTMLTextAreaElement> }) {
  return <InlineText inputRef={inputRef} className="byline-context-heading" label="Heading" placeholder={fallback} value={value} maxLength={LIMITS.heading} readOnly={readOnly} onEnter={onEnter} onChange={onChange} />;
}

export function KeyFactsEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("keyFacts", node);
  const issues = useReadiness("keyFacts", id, node.fields);
  const announce = useAnnounce();
  const first = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, first);
  const readOnly = !node.editable;
  const facts = fields.facts;
  const full = facts.length >= LIMITS.factsMax;
  const root = () => node.editor.getElementByKey(nodeKey);
  const focusFact = (index: number, now = false) => focusIn(root(), `[data-fact-index="${index}"] .byline-field`, now);

  const apply = (change: { items: typeof facts; focus: number }, message?: string) => {
    set({ facts: change.items });
    if (message) announce(`${message} ${change.focus + 1} of ${change.items.length}.`);
    focusFact(change.focus);
  };
  const add = (index: number) => {
    if (full) return;
    apply(insertItem(facts, index, { id: newRowId(), text: "" }, LIMITS.factsMax), "Fact added.");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const direction = moveDirection(event);
    if (direction) {
      event.preventDefault();
      apply(moveItem(facts, index, direction), "Fact moved.");
      return;
    }
    // Backspace in an empty fact removes it and returns to the one before.
    if (event.key === "Backspace" && facts[index]?.text === "" && facts.length > 1) {
      event.preventDefault();
      apply({ ...removeItem(facts, index), focus: Math.max(0, index - 1) }, "Fact removed.");
    }
  };

  return (
    <BlockShell type="keyFacts" node={node} issues={issues} actions={<ButtonGroup><ToolTextButton label="Add fact" icon={<Plus />} disabled={full} onClick={() => add(facts.length)} /></ButtonGroup>}>
      <SupportingContext kind="keyFacts" headingId={`${id}-heading`} heading={<ContextHeading value={fields.heading} fallback={DEFAULT_HEADINGS.keyFacts} readOnly={readOnly} onChange={(heading) => set({ heading }, "heading")} onEnter={() => focusFact(0, true)} />}>
        <ul>
          {facts.map((fact, index) => (
            <li key={fact.id} data-fact-index={index} className="byline-editable-row">
              <InlineText inputRef={index === 0 ? first : undefined} label={`Fact ${index + 1} of ${facts.length}`} placeholder="One verified fact." value={fact.text} maxLength={LIMITS.fact} readOnly={readOnly} onEnter={() => add(index + 1)} onKeyDown={(event) => onKeyDown(event, index)} onChange={(text) => set({ facts: facts.map((row) => (row.id === fact.id ? { ...row, text } : row)) }, `fact:${fact.id}`)} />
              {readOnly ? null : (
                <ButtonGroup className="byline-row-actions" aria-label={`Fact ${index + 1} actions`} data-byline-chrome="">
                  <ToolButton label="Move up" disabled={index === 0} onClick={() => apply(moveItem(facts, index, -1), "Fact moved.")}><ArrowUp /></ToolButton>
                  <ToolButton label="Move down" disabled={index === facts.length - 1} onClick={() => apply(moveItem(facts, index, 1), "Fact moved.")}><ArrowDown /></ToolButton>
                  <ToolButton label="Remove fact" onClick={() => apply(removeItem(facts, index, () => ({ id: newRowId(), text: "" })), "Fact removed.")}><Trash2 /></ToolButton>
                </ButtonGroup>
              )}
            </li>
          ))}
        </ul>
      </SupportingContext>
    </BlockShell>
  );
}

/**
 * The Context body as paragraphs, each typed in its own paragraph slot so it
 * keeps the article's paragraph spacing. Enter starts a new paragraph;
 * Backspace at the start of one joins it to the one before. Stored as plain
 * text with blank lines between paragraphs.
 */
function ParagraphFields({ value, readOnly, onChange, label, placeholder, inputRef }: { value: string; readOnly: boolean; onChange: (value: string) => void; label: string; placeholder: string; inputRef?: React.Ref<HTMLTextAreaElement> }) {
  const paragraphs = value.split(/\n\s*\n/);
  const write = (next: string[]) => onChange(next.join("\n\n"));
  // The paragraphs are direct children of the context element, as in the article.
  const focusAt = (from: HTMLElement, index: number, caret: number) => window.requestAnimationFrame(() => {
    const element = from.closest("aside")?.querySelectorAll<HTMLTextAreaElement>(":scope > p > .byline-field")[index];
    element?.focus();
    element?.setSelectionRange(caret, caret);
  });
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          <InlineText
            inputRef={index === 0 ? inputRef : undefined}
            label={paragraphs.length > 1 ? `${label}, paragraph ${index + 1}` : label}
            placeholder={index === 0 ? placeholder : ""}
            value={paragraph}
            readOnly={readOnly}
            onChange={(text) => write(paragraphs.map((current, i) => (i === index ? text : current)))}
            onKeyDown={(event) => {
              const field = event.currentTarget;
              if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault();
                const before = field.value.slice(0, field.selectionStart).trimEnd();
                const after = field.value.slice(field.selectionEnd).trimStart();
                write([...paragraphs.slice(0, index), before, after, ...paragraphs.slice(index + 1)]);
                focusAt(field, index + 1, 0);
              } else if (event.key === "Backspace" && index > 0 && field.selectionStart === 0 && field.selectionEnd === 0) {
                event.preventDefault();
                const previous = paragraphs[index - 1] ?? "";
                write([...paragraphs.slice(0, index - 1), previous + paragraph, ...paragraphs.slice(index + 1)]);
                focusAt(field, index - 1, previous.length);
              }
            }}
          />
        </p>
      ))}
    </>
  );
}

export function ContextEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("context", node);
  const issues = useReadiness("context", id, node.fields);
  const heading = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, body);
  const readOnly = !node.editable;
  return (
    <BlockShell
      type="context"
      node={node}
      issues={issues}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
            Heading
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CONTEXT_HEADING_SUGGESTIONS.map((suggestion) => (
              <DropdownMenuItem key={suggestion} onClick={() => set({ heading: suggestion })}>{suggestion}</DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => heading.current?.focus()}>Write your own…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <SupportingContext kind="context" headingId={`${id}-heading`} heading={<ContextHeading inputRef={heading} value={fields.heading} fallback={DEFAULT_HEADINGS.context} readOnly={readOnly} onChange={(value) => set({ heading: value }, "heading")} onEnter={() => body.current?.focus()} />}>
        <ParagraphFields inputRef={body} label="Context" placeholder="The background a reader needs, in a few sentences." value={fields.body} readOnly={readOnly} onChange={(value) => set({ body: value.slice(0, LIMITS.contextBody) }, "body")} />
      </SupportingContext>
    </BlockShell>
  );
}
