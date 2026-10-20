import { BlockControls, RichText, useBlockProps } from "@wordpress/block-editor";
import { registerBlockType } from "@wordpress/blocks";
import { Button, Path, SVG, ToolbarButton, ToolbarGroup } from "@wordpress/components";
import { useEffect, useRef, useState } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";
import { arrowDown, arrowUp, copy, insertAfter, insertBefore, plus, trash } from "@wordpress/icons";
import type { KeyboardEvent } from "react";
import { StoryCaption } from "../story/fields";
import metadata from "./block.json";
import { deprecated } from "./deprecated";
import { addEvent, duplicateEvent, isStub, moveEvent, periodStarts, removeEvent, setCurrentEvent, MAX_TIMELINE_ITEMS, type TimelineChange, type TimelineItem } from "./items";
import { TimelineSave } from "./save";
import "./style.css";

const TEXT = "weekly-wildcat-headless";
type Field = "label" | "title" | "body";
const FIELD_SELECTOR: Record<Field, string> = { label: "textarea.byline-timeline-label", title: "textarea.byline-timeline-title", body: ".byline-timeline-body" };

const fieldOf = (element: Element | null): Field => (element?.classList.contains("byline-timeline-title") ? "title" : element?.classList.contains("byline-timeline-body") ? "body" : "label");

/** A rule with events hanging off it. */
const icon = <SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><Path d="M11.25 4h1.5v16h-1.5V4ZM5 6h4.5v1.5H5V6Zm9.5 5.25H19v1.5h-4.5v-1.5ZM5 16.5h4.5V18H5v-1.5Z" /><Path d="M12 6.25a1.5 1.5 0 1 1 0 .01Zm0 5a1.5 1.5 0 1 1 0 .01Zm0 5a1.5 1.5 0 1 1 0 .01Z" /></SVG>;

function TimelineEdit({ attributes, setAttributes, isSelected }: any) {
  const items: TimelineItem[] = attributes.items;
  const root = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<{ index: number; field: Field } | null>(null);
  // The event the writer is in, and the kind of field. The block toolbar acts on the event and returns the caret to that field.
  const [active, setActive] = useState(0);
  const lastField = useRef<Field>("label");
  const [announcement, setAnnouncement] = useState("");
  const current = Math.min(active, items.length - 1);
  const starts = periodStarts(items);

  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    root.current?.querySelector<HTMLElement>(`[data-timeline-index="${request.index}"] ${FIELD_SELECTOR[request.field]}`)?.focus();
  }, [items]);

  function apply(change: TimelineChange, field: Field, message?: string) {
    focusRequest.current = { index: change.focusIndex, field };
    setActive(change.focusIndex);
    if (change.items !== items) setAttributes({ items: change.items });
    else root.current?.querySelector<HTMLElement>(`[data-timeline-index="${change.focusIndex}"] ${FIELD_SELECTOR[field]}`)?.focus();
    if (message) setAnnouncement(`${message} ${change.focusIndex + 1} / ${change.items.length}`);
  }
  const full = items.length >= MAX_TIMELINE_ITEMS;
  const add = (index: number, field: Field = "label") => apply(addEvent(items, index), field, __("Event added.", TEXT));
  const duplicate = () => apply(duplicateEvent(items, current), lastField.current, __("Event duplicated.", TEXT));
  const move = (direction: -1 | 1) => apply(moveEvent(items, current, direction), lastField.current, direction < 0 ? __("Event moved earlier.", TEXT) : __("Event moved later.", TEXT));
  const remove = () => apply(removeEvent(items, current), "label", __("Event removed.", TEXT));

  function update(index: number, field: Field, value: string) {
    setAttributes({ items: items.map((item, i) => (i === index ? { ...item, [field]: value } : item)) });
  }

  // Enter moves through an event (date, headline, explanation) and on to the next one, adding it after the last.
  function onKeyDown(event: KeyboardEvent, index: number, field: Field) {
    if (event.altKey && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      apply(moveEvent(items, index, event.key === "ArrowUp" ? -1 : 1), field, __("Event moved.", TEXT));
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (field === "label") focusField(index, "title");
    else if (field === "title") focusField(index, "body");
    else if (index < items.length - 1) focusField(index + 1, "label");
    else if (!full) add(items.length);
  }
  function focusField(index: number, field: Field) {
    setActive(index);
    root.current?.querySelector<HTMLElement>(`[data-timeline-index="${index}"] ${FIELD_SELECTOR[field]}`)?.focus();
  }

  // The ref goes through useBlockProps so Gutenberg's own selection and focus handling stays attached.
  const blockProps = useBlockProps({ className: "byline-timeline-editor", ref: root });
  return <div {...blockProps}>
    <BlockControls group="block">
      <ToolbarGroup>
        <ToolbarButton icon={insertBefore} label={__("Add event above", TEXT)} disabled={full} onClick={() => add(current)} />
        <ToolbarButton icon={insertAfter} label={__("Add event below", TEXT)} disabled={full} onClick={() => add(current + 1)} />
        <ToolbarButton icon={copy} label={__("Duplicate event", TEXT)} disabled={full} onClick={duplicate} />
        <ToolbarButton icon={arrowUp} label={__("Move event earlier", TEXT)} shortcut="Alt+Shift+↑" disabled={current === 0} onClick={() => move(-1)} />
        <ToolbarButton icon={arrowDown} label={__("Move event later", TEXT)} shortcut="Alt+Shift+↓" disabled={current === items.length - 1} onClick={() => move(1)} />
        <ToolbarButton icon={trash} label={__("Remove event", TEXT)} onClick={remove} />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton isPressed={Boolean(items[current]?.current)} label={__("Mark as the latest event", TEXT)} onClick={() => setAttributes({ items: setCurrentEvent(items, current, !items[current]?.current) })}>{__("Latest", TEXT)}</ToolbarButton>
      </ToolbarGroup>
    </BlockControls>
    <ol className="byline-timeline">
      {items.map((item, index) => <li key={index} data-timeline-index={index} onFocus={(event) => { setActive(index); lastField.current = fieldOf(event.target as Element); }} onKeyDown={(event) => onKeyDown(event, index, fieldOf(event.target as Element))}
        className={["byline-timeline-item", item.current ? "is-current" : "", starts[index] ? "is-new-period" : "", isSelected && index === current ? "is-active" : ""].filter(Boolean).join(" ")}>
        <StoryCaption singleLine className="byline-timeline-label" label={__("Date or label", TEXT)} placeholder={__("Oct. 17", TEXT)} value={item.label} onChange={(value) => update(index, "label", value)} />
        <StoryCaption singleLine className="byline-timeline-title" label={__("Event title", TEXT)} placeholder={__("What happened?", TEXT)} value={item.title} onChange={(value) => update(index, "title", value)} />
        <RichText tagName="p" className="byline-timeline-body" aria-label={__("Event explanation", TEXT)} value={item.body} allowedFormats={["core/bold", "core/italic", "core/link"]} disableLineBreaks placeholder={__("Add the context readers need…", TEXT)} onChange={(value: string) => update(index, "body", value)} />
        {item.label.trim() && isStub(item) ? <div className="byline-timeline-hint">{__("Add a headline or an explanation, or this event will not be published.", TEXT)}</div> : null}
      </li>)}
    </ol>
    <div className="byline-timeline-footer">
      <Button variant="secondary" icon={plus} disabled={full} onClick={() => add(items.length)}>{__("Add event", TEXT)}</Button>
      <span>{sprintf(__("%1$d of %2$d events", TEXT), items.length, MAX_TIMELINE_ITEMS)}</span>
      {isSelected ? <span className="byline-timeline-tip">{__("Enter moves to the next field and adds the next event. Alt + Shift + ↑ ↓ moves the event.", TEXT)}</span> : null}
    </div>
    <div className="byline-visually-hidden" role="status" aria-live="polite">{announcement}</div>
  </div>;
}
registerBlockType(metadata as any, { icon, edit: TimelineEdit, save: TimelineSave as any, deprecated: deprecated as any });
