"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, CONTEXT_HEADING_SUGGESTIONS, DEFAULT_HEADINGS, safeWebUrl, webUrlHost } from "@byline/article-body";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { PullQuoteView, ReportedQuoteView, SupportingContext } from "@byline/ui/article-body";
import { ArrowDown, ArrowUp, ChevronDown, Link2, Plus, Trash2 } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { newRowId } from "../../fields";
import { insertItem, moveDirection, moveItem, removeItem } from "../../items";
import { BlockShell, SecondarySetting, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce } from "../host";
import { ChoiceToggle } from "./parts";
import { RichFormatButtons, RichParagraphs, type RichFieldHandle } from "./rich-text";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

export function ReportedQuoteEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("reportedQuote", node);
  const issues = useReadiness("reportedQuote", id, node.fields);
  const text = useRef<HTMLTextAreaElement>(null);
  const attribution = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, text);
  const readOnly = !node.editable;
  const urlId = useId();
  const labelId = useId();
  const sourceUrl = safeWebUrl(fields.sourceUrl);
  const invalid = Boolean(fields.sourceUrl.trim()) && !sourceUrl;
  return (
    <BlockShell
      type="reportedQuote"
      node={node}
      issues={issues}
      actions={
        <SecondarySetting label={fields.sourceUrl ? "Edit source" : "Add source"} title="Where it was said" description="Optional: a public page where readers can find the statement, such as minutes, a press release or a post." icon={<Link2 />}>
          <FieldGroup className="gap-4">
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor={urlId}>Source address</FieldLabel>
              <InputGroup>
                <InputGroupAddon><Link2 /></InputGroupAddon>
                <InputGroupInput id={urlId} inputMode="url" placeholder="https://" value={fields.sourceUrl} maxLength={LIMITS.webUrl} readOnly={readOnly} aria-invalid={invalid || undefined} onChange={(event) => set({ sourceUrl: event.target.value.trim() })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
              </InputGroup>
              {invalid ? <FieldError>Use a web address that starts with https://.</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={labelId}>Link text</FieldLabel>
              <Input id={labelId} placeholder={sourceUrl ? webUrlHost(sourceUrl) : "School board minutes, Oct. 21"} value={fields.sourceLabel} maxLength={LIMITS.quoteSourceLabel} readOnly={readOnly} onChange={(event) => set({ sourceLabel: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
              <FieldDescription>Optional. Without it, readers see the site's name.</FieldDescription>
            </Field>
          </FieldGroup>
        </SecondarySetting>
      }
    >
      <ReportedQuoteView
        text={<InlineText inputRef={text} className="byline-quote-text" label="Quote" placeholder="Type the quote exactly as it was said." value={fields.text} maxLength={LIMITS.quote} readOnly={readOnly} multiline onEnter={() => attribution.current?.focus()} onChange={(value) => set({ text: value })} />}
        attribution={<InlineText inputRef={attribution} className="byline-quote-attribution" label="Who said it" placeholder="Name, title" value={fields.attribution} maxLength={LIMITS.attribution} readOnly={readOnly} onChange={(value) => set({ attribution: value })} />}
        source={sourceUrl ? <>Source: <a href={sourceUrl} onClick={(event) => event.preventDefault()} tabIndex={-1}>{fields.sourceLabel || webUrlHost(sourceUrl)}</a></> : undefined}
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
        text={<InlineText inputRef={text} className="byline-quote-text" label="Pull quote" placeholder="A line from the story worth repeating." value={fields.text} maxLength={LIMITS.quote} readOnly={readOnly} multiline onEnter={() => attribution.current?.focus()} onChange={(value) => set({ text: value })} />}
        attribution={<InlineText inputRef={attribution} className="byline-quote-attribution" label="Attribution (optional)" placeholder="Who said it (optional)" value={fields.attribution} maxLength={LIMITS.attribution} readOnly={readOnly} onChange={(value) => set({ attribution: value })} />}
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
      apply({ ...removeItem(facts, index), focus: Math.max(0, index - 1) });
    }
  };

  return (
    <BlockShell
      type="keyFacts"
      node={node}
      issues={issues}
      actions={
        <>
          <ButtonGroup><ToolTextButton label="Add fact" icon={<Plus />} disabled={full} onClick={() => add(facts.length)} /></ButtonGroup>
          <ChoiceToggle label="Treatment" value={fields.presentation} options={[{ value: "standard", label: "Standard" }, { value: "compact", label: "Compact" }]} onChange={(presentation) => {
            set({ presentation });
            announce(presentation === "compact" ? "Compact: two columns when there is room." : "Standard: one fact per row.");
          }} />
        </>
      }
    >
      <SupportingContext kind="keyFacts" presentation={fields.presentation} headingId={`${id}-heading`} heading={<ContextHeading value={fields.heading} fallback={DEFAULT_HEADINGS.keyFacts} readOnly={readOnly} onChange={(heading) => set({ heading })} onEnter={() => focusFact(0, true)} />}>
        <ul>
          {facts.map((fact, index) => (
            <li key={fact.id} data-fact-index={index} className="byline-editable-row">
              <InlineText inputRef={index === 0 ? first : undefined} label={`Fact ${index + 1} of ${facts.length}`} placeholder="One verified fact." value={fact.text} maxLength={LIMITS.fact} readOnly={readOnly} onEnter={() => add(index + 1)} onKeyDown={(event) => onKeyDown(event, index)} onChange={(text) => set({ facts: facts.map((row) => (row.id === fact.id ? { ...row, text } : row)) })} />
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

export function ContextEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("context", node);
  const issues = useReadiness("context", id, node.fields);
  const heading = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const rich = useRef<RichFieldHandle>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  useFocusWhenCreated(nodeKey, body);
  const readOnly = !node.editable;
  return (
    <BlockShell
      type="context"
      node={node}
      issues={issues}
      actions={
        <>
        <RichFormatButtons field={rich} readOnly={readOnly} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} />
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
        </>
      }
    >
      <SupportingContext kind="context" headingId={`${id}-heading`} heading={<ContextHeading inputRef={heading} value={fields.heading} fallback={DEFAULT_HEADINGS.context} readOnly={readOnly} onChange={(value) => set({ heading: value })} onEnter={() => body.current?.focus()} />}>
        <RichParagraphs inputRef={body} handleRef={rich} label="Context" placeholder="The background a reader needs, in a few sentences. Select words to make them bold, italic or a link." value={fields.body} readOnly={readOnly} onChange={(value) => set({ body: value })} onLinkShortcut={() => setLinkOpen(true)} />
      </SupportingContext>
    </BlockShell>
  );
}
