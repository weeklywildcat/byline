/**
 * Dragging events between days.
 *
 * Schedule-X's drag-and-drop is a premium package, so Byline moves events
 * itself with the same Pragmatic drag-and-drop the Board uses. An event chip
 * is a drag source; the day under the pointer (a month cell, a week column, an
 * all-day cell) is found from Schedule-X's own day markup when the drag
 * moves, so nothing is registered per cell and a view change needs no
 * re-wiring. A drop only ever reports a newsroom day; what that means for the
 * event is `calendar-reschedule`.
 */
import { createContext, use, useEffect, useRef, useState, type RefObject } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { rescheduleKindOf, type RescheduleKind } from "./calendar-reschedule";
import type { BylineScheduleXEvent } from "./schedule-x-adapter";

export const CALENDAR_DRAG_TYPE = "byline-calendar-event";

/** Schedule-X's day containers, in every view that has them. The week header and agenda rows do not match. */
const DAY_CELL = ".sx__month-grid-day[data-date], [data-time-grid-date], [data-date-grid-date]";

/** The newsroom day of the cell at a point, or null when it is not over a day. */
export function dayAtPoint(root: ParentNode, x: number, y: number): { day: string; cell: HTMLElement } | null {
  const doc = (root as Document).elementFromPoint ? (root as Document) : (root as Element).ownerDocument;
  const cell = doc?.elementFromPoint(x, y)?.closest<HTMLElement>(DAY_CELL);
  const day = cell?.dataset.date ?? cell?.dataset.timeGridDate ?? cell?.dataset.dateGridDate ?? null;
  return cell && day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { day, cell } : null;
}

/** Who may move what. Absent: the calendar is read-only and nothing can be picked up. */
export type CalendarDragPolicy = { can: (kind: RescheduleKind) => boolean };
export const CalendarDragPolicyContext = createContext<CalendarDragPolicy | null>(null);

/** May this event be picked up? */
export function useCanDrag(event: BylineScheduleXEvent): boolean {
  const policy = use(CalendarDragPolicyContext);
  const kind = rescheduleKindOf({ type: event.bylineType, storyId: event.storyId, recordId: event.recordId });
  return Boolean(policy && kind && policy.can(kind));
}

/** Makes an event chip a drag source when the reader may move it. */
export function useEventDrag(ref: RefObject<HTMLElement | null>, event: BylineScheduleXEvent): { dragging: boolean; canDrag: boolean } {
  const canDrag = useCanDrag(event);
  const [dragging, setDragging] = useState(false);
  const id = event.bylineId;
  useEffect(() => {
    const element = ref.current;
    if (!element || !canDrag) return;
    return draggable({
      element,
      getInitialData: () => ({ type: CALENDAR_DRAG_TYPE, eventId: id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false)
    });
  }, [canDrag, id, ref]);
  return { dragging, canDrag };
}

/**
 * Watches calendar drags inside `frame`: marks the day under the pointer
 * (`data-drop-target`) and reports the day an event is dropped on.
 */
export function useCalendarDrop(frame: RefObject<HTMLElement | null>, onDrop: (eventId: string, day: string) => void) {
  const latest = useRef(onDrop);
  latest.current = onDrop;
  useEffect(() => {
    const root = frame.current;
    if (!root) return;
    let marked: HTMLElement | null = null;
    const mark = (cell: HTMLElement | null) => {
      if (marked === cell) return;
      marked?.removeAttribute("data-drop-target");
      cell?.setAttribute("data-drop-target", "");
      marked = cell;
    };
    const isOurs = (data: Record<string | symbol, unknown>) => data.type === CALENDAR_DRAG_TYPE && typeof data.eventId === "string";
    return combine(monitorForElements({
      canMonitor: ({ source }) => isOurs(source.data),
      onDrag: ({ location }) => {
        const { clientX, clientY } = location.current.input;
        const hit = dayAtPoint(root.ownerDocument, clientX, clientY);
        mark(hit && root.contains(hit.cell) ? hit.cell : null);
      },
      onDrop: ({ source, location }) => {
        mark(null);
        const { clientX, clientY } = location.current.input;
        const hit = dayAtPoint(root.ownerDocument, clientX, clientY);
        if (hit && root.contains(hit.cell)) latest.current(source.data.eventId as string, hit.day);
      }
    }));
  }, [frame]);
}
