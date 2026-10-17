import { RichText, useBlockProps } from "@wordpress/block-editor";
import { Button, TextControl } from "@wordpress/components";
import { registerBlockType } from "@wordpress/blocks";
import { useEffect, useRef } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import metadata from "./block.json";
import { changeTimeline, MAX_TIMELINE_ITEMS, type TimelineItem } from "./items";
import { TimelineSave } from "./save";
import "./style.css";

function TimelineEdit({ attributes, setAttributes }: any) {
  const items: TimelineItem[] = attributes.items;
  const root = useRef<HTMLDivElement>(null);
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current === null) return;
    root.current?.querySelector<HTMLInputElement>(`[data-timeline-index="${focusIndex.current}"] input`)?.focus();
    focusIndex.current = null;
  }, [items]);
  function change(action: "add" | "remove" | "up" | "down", index?: number) {
    const next = changeTimeline(items, action, index);
    focusIndex.current = next.focusIndex;
    setAttributes({ items: next.items });
  }
  function update(index: number, field: keyof TimelineItem, value: string) {
    setAttributes({ items: items.map((item, i) => i === index ? { ...item, [field]: value } : item) });
  }
  return <div {...useBlockProps({ className: "byline-timeline-editor" })} ref={root}>
    <ol className="byline-timeline">
      {items.map((item, index) => <li className="byline-timeline-item" key={index} data-timeline-index={index}>
        <TextControl __nextHasNoMarginBottom label={__("Date or label", "weekly-wildcat-headless")} value={item.label} onChange={(value: string) => update(index, "label", value)} placeholder="Oct. 17 / Fall 2026" />
        <TextControl __nextHasNoMarginBottom label={__("Event title", "weekly-wildcat-headless")} value={item.title} onChange={(value: string) => update(index, "title", value)} />
        <RichText tagName="p" className="byline-timeline-body" aria-label={__("Event explanation", "weekly-wildcat-headless")} value={item.body} allowedFormats={["core/bold", "core/italic", "core/link"]} placeholder={__("Add context…", "weekly-wildcat-headless")} onChange={(value: string) => update(index, "body", value)} />
        <div className="byline-timeline-controls" role="group" aria-label={`Event ${index + 1} controls`}>
          <Button variant="secondary" disabled={index === 0} onClick={() => change("up", index)}>{__("Move up", "weekly-wildcat-headless")}</Button>
          <Button variant="secondary" disabled={index === items.length - 1} onClick={() => change("down", index)}>{__("Move down", "weekly-wildcat-headless")}</Button>
          <Button variant="tertiary" isDestructive disabled={items.length === 1} onClick={() => change("remove", index)}>{__("Remove item", "weekly-wildcat-headless")}</Button>
        </div>
      </li>)}
    </ol>
    <Button variant="secondary" disabled={items.length >= MAX_TIMELINE_ITEMS} onClick={() => change("add")}>{__("Add item", "weekly-wildcat-headless")}</Button>
    <p aria-live="polite">{items.length} / {MAX_TIMELINE_ITEMS} events</p>
  </div>;
}
registerBlockType(metadata as any, { edit: TimelineEdit, save: TimelineSave as any });
