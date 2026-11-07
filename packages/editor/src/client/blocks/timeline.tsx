"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, isStubEvent, periodStarts } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Toggle } from "@byline/newsroom-ui/ui/toggle";
import { TimelineItem, TimelineList } from "@byline/ui/article-body";
import { ArrowDown, ArrowUp, Copy, ListEnd, ListStart, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { newRowId, type BylineBlockFields } from "../../fields";
import { duplicateItem, insertItem, moveDirection, moveItem, removeItem, setOnlyCurrent, type ItemChange } from "../../items";
import { BlockShell, ToolButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce } from "../host";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

type Event = BylineBlockFields["timeline"]["items"][number];
type Field = "label" | "title" | "body";
const blank = (): Event => ({ id: newRowId(), label: "", title: "", body: "", current: false });

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

  const focusField = (index: number, field: Field) => {
    setActive(index);
    focusIn(root(), `[data-timeline-index="${index}"] .byline-timeline-${field}`);
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
  const update = (index: number, field: Field, value: string) => set({ items: items.map((event, i) => (i === index ? { ...event, [field]: value } : event)) }, `${field}:${items[index]?.id}`);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number, field: Field) => {
    const direction = moveDirection(event);
    if (direction && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(index, direction, field);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (field === "label") focusField(index, "title");
    else if (field === "title") focusField(index, "body");
    else if (index < items.length - 1) focusField(index + 1, "label");
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
