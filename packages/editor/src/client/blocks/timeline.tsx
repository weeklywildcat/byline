"use client";

import { altFor, ARTICLE_BLOCK_LIMITS as LIMITS, isDocumentAsset, isStubEvent, periodStarts, safeWebUrl, webUrlHost } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Field as FormField, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Toggle } from "@byline/newsroom-ui/ui/toggle";
import { ArticleImage, StoryFigure, TimelineItem, TimelineList } from "@byline/ui/article-body";
import { ArrowDown, ArrowUp, Copy, FileText, ImagePlus, Link2, ListEnd, ListStart, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { blankTimelineEvent, newRowId, type BylineBlockFields } from "../../fields";
import { duplicateItem, insertItem, moveDirection, moveItem, removeItem, setOnlyCurrent, type ItemChange } from "../../items";
import { BlockShell, SettingsSurface, ToolButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useMediaAsset, usePickMedia } from "../host";
import { AltTextSetting, MediaStatus } from "./media";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

type Event = BylineBlockFields["timeline"]["items"][number];
type Field = "label" | "title" | "body";
const blank = (): Event => blankTimelineEvent(newRowId());

/** An event's web link: its text on the canvas, address and label in a Popover (a Sheet on touch). */
function EventLink({ event, index, readOnly, open, onOpenChange, onChange }: { event: Event; index: number; readOnly: boolean; open: boolean; onOpenChange: (open: boolean) => void; onChange: (patch: Partial<Event>) => void }) {
  const urlId = useId();
  const labelId = useId();
  const url = safeWebUrl(event.linkUrl);
  const invalid = Boolean(event.linkUrl.trim()) && !url;
  return (
    <SettingsSurface
      open={open}
      onOpenChange={onOpenChange}
      title={`Link for event ${index + 1}`}
      description="A public web page that backs up this event."
      trigger={
        <button type="button" className="byline-timeline-evidence-edit" data-byline-chrome="" aria-label={event.linkUrl ? `Edit the link for event ${index + 1}` : `Add a link to event ${index + 1}`}>
          <Link2 aria-hidden="true" />
          {url ? event.linkLabel || webUrlHost(url) : event.linkUrl ? "Fix the link" : "Link"}
        </button>
      }
    >
      <FieldGroup className="gap-4">
        <FormField data-invalid={invalid || undefined}>
          <FieldLabel htmlFor={urlId}>Address</FieldLabel>
          <InputGroup>
            <InputGroupAddon><Link2 /></InputGroupAddon>
            <InputGroupInput id={urlId} inputMode="url" placeholder="https://" value={event.linkUrl} maxLength={LIMITS.webUrl} readOnly={readOnly} aria-invalid={invalid || undefined} onChange={(change) => onChange({ linkUrl: change.target.value.trim() })} onKeyDown={(key) => { if (key.key === "Enter") key.preventDefault(); }} />
          </InputGroup>
          {invalid ? <FieldError>Use a web address that starts with https://.</FieldError> : null}
        </FormField>
        <FormField>
          <FieldLabel htmlFor={labelId}>Link text</FieldLabel>
          <Input id={labelId} placeholder={url ? webUrlHost(url) : "Meeting video"} value={event.linkLabel} maxLength={LIMITS.timelineLinkLabel} readOnly={readOnly} onChange={(change) => onChange({ linkLabel: change.target.value })} onKeyDown={(key) => { if (key.key === "Enter") key.preventDefault(); }} />
          <FieldDescription>Optional. Without it, readers see the site's name.</FieldDescription>
        </FormField>
      </FieldGroup>
      <div className="flex justify-between gap-2">
        <Button type="button" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        {readOnly ? null : <Button type="button" size="sm" variant="ghost" onClick={() => { onChange({ linkUrl: "", linkLabel: "" }); onOpenChange(false); }}><Trash2 />Remove link</Button>}
      </div>
    </SettingsSurface>
  );
}

/** An event's PDF: its name, the page typed in place, a remove action. */
function EventDocument({ event, index, readOnly, onChange }: { event: Event; index: number; readOnly: boolean; onChange: (patch: Partial<Event>) => void }) {
  const entry = useMediaAsset(event.document);
  const asset = entry.asset;
  return (
    <span className="byline-timeline-document-field" data-byline-chrome="">
      <FileText aria-hidden="true" />
      <span>{asset ? asset.filename : entry.status === "loading" ? "Loading…" : "This file is no longer in Media."}{asset && !isDocumentAsset(asset) ? " (not a PDF)" : ""}</span>
      <label>
        <span>Page</span>
        <input type="number" inputMode="numeric" min={1} data-byline-field="" className="byline-field" aria-label={`Page of the document for event ${index + 1} (optional)`} value={event.documentPage ?? ""} readOnly={readOnly} onKeyDown={(key) => { if (key.key === "Enter") key.preventDefault(); }} onChange={(change) => {
          const page = change.target.value === "" ? null : Math.max(1, Math.floor(Number(change.target.value)));
          onChange({ documentPage: Number.isFinite(page) ? page : null });
        }} />
      </label>
      {readOnly ? null : <ToolButton label={`Remove the document from event ${index + 1}`} onClick={() => onChange({ document: null, documentPage: null })}><Trash2 /></ToolButton>}
    </span>
  );
}

/** An event's supporting photograph, drawn as readers see it, with its caption typed in place. */
function EventPhoto({ event, index, readOnly, onChange, onReplace }: { event: Event; index: number; readOnly: boolean; onChange: (patch: Partial<Event>) => void; onReplace: () => void }) {
  const entry = useMediaAsset(event.media);
  const asset = entry.asset;
  return (
    <StoryFigure
      className="byline-timeline-photo"
      media={
        <div className="byline-timeline-photo-media">
          {asset ? <ArticleImage asset={{ ...asset, src: asset.previewSrc ?? asset.src }} alt={altFor(asset, event.altOverride)} /> : <MediaStatus status={entry.status === "loading" ? "loading" : "missing"} kind="image" />}
          {readOnly ? null : (
            <ButtonGroup className="byline-item-actions" aria-label={`Photograph for event ${index + 1}`} data-byline-chrome="">
              <ToolButton label="Replace photograph" onClick={onReplace}><ImagePlus /></ToolButton>
              <AltTextSetting asset={asset} value={event.altOverride} readOnly={readOnly} onChange={(altOverride) => onChange({ altOverride })} />
              <ToolButton label={`Remove the photograph from event ${index + 1}`} onClick={() => onChange({ media: null, altOverride: "", caption: "" })}><Trash2 /></ToolButton>
            </ButtonGroup>
          )}
        </div>
      }
      caption={<InlineText className="byline-caption" label={`Caption for the photograph of event ${index + 1} (optional)`} placeholder="Caption (optional)" value={event.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(caption) => onChange({ caption })} />}
      credit={asset?.credit}
    />
  );
}

/**
 * The Timeline, edited in the timeline itself. Each event's date label,
 * headline and explanation are typed in their places on the axis. Enter
 * moves label → headline → explanation → the next event (adding one after
 * the last); Alt+Shift+↑/↓ moves the event; the toolbar adds, duplicates,
 * moves, removes and marks the latest event. Changes are announced and focus
 * follows the event that changed.
 */
export function TimelineEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("timeline", node);
  const issues = useReadiness("timeline", id, node.fields);
  const announce = useAnnounce();
  const first = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, first);
  const readOnly = !node.editable;
  const items = fields.items;
  const [active, setActive] = useState(0);
  const lastField = useRef<Field>("label");
  const current = Math.min(active, items.length - 1);
  const starts = periodStarts(items);
  const full = items.length >= LIMITS.timelineMax;
  const root = () => node.editor.getElementByKey(nodeKey);

  const focusField = (index: number, field: Field, now = false) => {
    setActive(index);
    focusIn(root(), `[data-timeline-index="${index}"] .byline-timeline-${field}`, now);
  };
  const apply = (change: ItemChange<Event>, field: Field, message: string) => {
    set({ items: change.items });
    setActive(change.focus);
    announce(`${message} Event ${change.focus + 1} of ${change.items.length}.`);
    focusField(change.focus, field);
  };
  const add = (index: number, field: Field = "label") => {
    if (full) return;
    apply(insertItem(items, index, blank(), LIMITS.timelineMax), field, "Event added.");
  };
  const move = (index: number, direction: -1 | 1, field: Field) => {
    const change = moveItem(items, index, direction);
    if (change.focus !== index) apply(change, field, direction < 0 ? "Event moved earlier." : "Event moved later.");
  };
  const remove = (index: number) => apply(removeItem(items, index, blank), "label", "Event removed.");
  const duplicate = (index: number) => apply(duplicateItem(items, index, (event) => ({ ...event, id: newRowId(), current: false }), LIMITS.timelineMax), lastField.current, "Event duplicated.");
  const update = (index: number, field: Field, value: string) => set({ items: items.map((event, i) => (i === index ? { ...event, [field]: value } : event)) });
  const patch = (index: number, change: Partial<Event>) => set({ items: items.map((event, i) => (i === index ? { ...event, ...change } : event)) });
  const pick = usePickMedia();
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const addPhoto = async (index: number) => {
    const [asset] = await pick({ kind: "image", multiple: false, title: `Photograph for event ${index + 1}`, confirmLabel: "Use this photograph" });
    if (!asset) return;
    patch(index, { media: asset.id });
    announce(`Photograph added to event ${index + 1}.`);
    focusIn(root(), `[data-timeline-index="${index}"] .byline-timeline-photo .byline-field`);
  };
  const addDocument = async (index: number) => {
    const [asset] = await pick({ kind: "document", multiple: false, title: `Document for event ${index + 1}`, confirmLabel: "Use this PDF" });
    if (!asset) return;
    patch(index, { document: asset.id });
    announce(`Document added to event ${index + 1}. Type a page number if one page matters.`);
    focusIn(root(), `[data-timeline-index="${index}"] .byline-timeline-document-field input`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number, field: Field) => {
    const direction = moveDirection(event);
    if (direction && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(index, direction, field);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (field === "label") focusField(index, "title", true);
    else if (field === "title") focusField(index, "body", true);
    else if (index < items.length - 1) focusField(index + 1, "label", true);
    else if (!full) add(items.length);
  };

  const event = items[current];
  return (
    <BlockShell
      type="timeline"
      node={node}
      issues={issues}
      actions={readOnly || !event ? null : (
        <>
          <span className="byline-block-chrome-context" aria-live="off">Event {current + 1} of {items.length}</span>
          <ButtonGroup aria-label="Event">
            <ToolButton label="Add event above" disabled={full} onClick={() => add(current)}><ListStart /></ToolButton>
            <ToolButton label="Add event below" disabled={full} onClick={() => add(current + 1)}><ListEnd /></ToolButton>
            <ToolButton label="Duplicate event" disabled={full} onClick={() => duplicate(current)}><Copy /></ToolButton>
          </ButtonGroup>
          <ButtonGroup aria-label="Order">
            <ToolButton label="Move event earlier (Alt+Shift+↑)" disabled={current === 0} onClick={() => move(current, -1, lastField.current)}><ArrowUp /></ToolButton>
            <ToolButton label="Move event later (Alt+Shift+↓)" disabled={current === items.length - 1} onClick={() => move(current, 1, lastField.current)}><ArrowDown /></ToolButton>
          </ButtonGroup>
          <ButtonGroup aria-label="Evidence for this event">
            <ToolButton label="Add photo" disabled={event.media !== null} onClick={() => void addPhoto(current)}><ImagePlus /></ToolButton>
            <ToolButton label="Add link" disabled={Boolean(event.linkUrl)} onClick={() => setLinkFor(event.id)}><Link2 /></ToolButton>
            <ToolButton label="Add document" disabled={event.document !== null} onClick={() => void addDocument(current)}><FileText /></ToolButton>
          </ButtonGroup>
          <Toggle size="sm" variant="outline" aria-label="Mark as the latest event" pressed={event.current} onPressedChange={(pressed) => {
            set({ items: setOnlyCurrent(items, current, pressed) });
            announce(pressed ? `Event ${current + 1} marked as the latest.` : "No event is marked as the latest.");
          }}>Latest</Toggle>
          <ButtonGroup>
            <ToolButton label="Remove event" onClick={() => remove(current)}><Trash2 /></ToolButton>
          </ButtonGroup>
        </>
      )}
    >
      <TimelineList>
        {items.map((item, index) => {
          const fieldProps = (field: Field) => ({
            readOnly,
            onKeyDown: (keyEvent: KeyboardEvent<HTMLTextAreaElement>) => onKeyDown(keyEvent, index, field),
            onChange: (value: string) => update(index, field, value)
          });
          return (
            <TimelineItem
              key={item.id}
              current={item.current}
              newPeriod={starts[index] ?? false}
              data-timeline-index={index}
              data-active={!readOnly && index === current ? "" : undefined}
              onFocus={(focusEvent) => {
                setActive(index);
                const target = focusEvent.target as Element;
                lastField.current = target.classList.contains("byline-timeline-title") ? "title" : target.classList.contains("byline-timeline-body") ? "body" : "label";
              }}
              label={<InlineText inputRef={index === 0 ? first : undefined} className="byline-timeline-label" label={`Date or label, event ${index + 1}`} placeholder="Oct. 17" value={item.label} maxLength={LIMITS.timelineLabel} {...fieldProps("label")} />}
              title={<InlineText className="byline-timeline-title" label={`Headline, event ${index + 1}`} placeholder="What happened?" value={item.title} maxLength={LIMITS.timelineTitle} {...fieldProps("title")} />}
              body={
                <>
                  <InlineText className="byline-timeline-body" label={`Explanation, event ${index + 1}`} placeholder="The context readers need." value={item.body} maxLength={LIMITS.timelineBody} multiline {...fieldProps("body")} />
                  {!readOnly && item.label.trim() && isStubEvent(item) ? <p className="byline-timeline-hint" data-byline-chrome="">Add a headline or an explanation, or this event will not be published.</p> : null}
                </>
              }
              evidence={item.linkUrl || item.document !== null || linkFor === item.id ? (
                <ul>
                  {item.linkUrl || linkFor === item.id ? <li><EventLink event={item} index={index} readOnly={readOnly} open={linkFor === item.id} onOpenChange={(open) => setLinkFor(open ? item.id : null)} onChange={(change) => patch(index, change)} /></li> : null}
                  {item.document !== null ? <li><EventDocument event={item} index={index} readOnly={readOnly} onChange={(change) => patch(index, change)} /></li> : null}
                </ul>
              ) : undefined}
              media={item.media !== null ? <EventPhoto event={item} index={index} readOnly={readOnly} onChange={(change) => patch(index, change)} onReplace={() => void addPhoto(index)} /> : undefined}
            />
          );
        })}
      </TimelineList>
      {readOnly ? null : (
        <div className="byline-list-footer" data-byline-chrome="" contentEditable={false}>
          <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => add(items.length)}>
            <Plus />
            Add event
          </Button>
          <span>{items.length} of {LIMITS.timelineMax} events · Enter moves to the next field · Alt+Shift+↑↓ moves an event</span>
        </div>
      )}
    </BlockShell>
  );
}
