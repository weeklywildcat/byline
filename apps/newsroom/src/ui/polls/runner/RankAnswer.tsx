"use client";

import { closestCenter, DndContext, KeyboardSensor, MeasuringStrategy, PointerSensor, useSensor, useSensors, type Announcements } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ArrowDown, ArrowUp, Check, GripVertical } from "lucide-react";
import { useState } from "react";
import type { Choice } from "../../../polls/engine/types";

const MEASURING = { droppable: { strategy: MeasuringStrategy.BeforeDragging } };

export function RankAnswer({ choices, confirmed, onConfirm, onClear }: {
  choices: readonly Choice[];
  confirmed?: readonly string[];
  onConfirm: (order: string[]) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const order = draft ?? confirmed ?? choices.map(({ name }) => name);
  const [announcement, setAnnouncement] = useState("");
  const labels = new Map(choices.map(({ name, label }) => [name, label]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates
  }));
  const labelFor = (id: string | number) => labels.get(String(id)) ?? String(id);
  const position = (id: string | number) => order.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelFor(active.id)}, position ${position(active.id)} of ${order.length}.`,
    onDragOver: ({ active, over }) => over ? `${labelFor(active.id)} is over position ${position(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) => over ? `${labelFor(active.id)} dropped at position ${position(over.id)}.` : `${labelFor(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${labelFor(active.id)} cancelled.`
  };
  function move(from: number, to: number, announce = true) {
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    setDraft(arrayMove([...order], from, to));
    if (confirmed) onClear();
    if (announce) setAnnouncement(`${labels.get(order[from])} moved to position ${to + 1}.`);
  }
  const isConfirmed = Boolean(confirmed);
  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-sm text-muted-foreground">Put every answer in order from highest to lowest.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} measuring={MEASURING} accessibility={{ announcements }}
        onDragEnd={({ active, over }) => {
          if (over) move(position(active.id) - 1, position(over.id) - 1, false);
        }}>
        <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
          <ol className="m-0 grid list-none gap-2 p-0" aria-label="Current ranking">
            {order.map((name, index) => <RankRow key={name} name={name} label={labels.get(name) ?? name} index={index} last={index === order.length - 1} move={move} />)}
          </ol>
        </SortableContext>
      </DndContext>
      <p role="status" className="sr-only">{announcement}</p>
      <Button aria-pressed={isConfirmed} type="button" variant={isConfirmed ? "secondary" : "outline"} className="min-h-12 justify-self-start"
        onClick={() => { onConfirm([...order]); setDraft(null); setAnnouncement("Ranking confirmed."); }}>
        {isConfirmed ? <><Check />Order confirmed</> : "Use this order"}
      </Button>
    </div>
  );
}

function RankRow({ name, label, index, last, move }: { name: string; label: string; index: number; last: boolean; move: (from: number, to: number) => void }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transition, transform, isDragging } = useSortable({ id: name });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className="relative flex min-h-14 min-w-0 items-center gap-2 rounded-lg border bg-background pl-3 motion-reduce:transition-none! data-[dragging=true]:z-10 data-[dragging=true]:border-primary"
      data-dragging={isDragging}>
      <span className="text-sm font-medium tabular-nums text-muted-foreground">{index + 1}</span>
      <span className="min-w-0 flex-1 wrap-anywhere">{label}</span>
      <div className="flex shrink-0 flex-wrap items-center">
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Move ${label} up`} aria-disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Move ${label} down`} aria-disabled={last} onClick={() => move(index, index + 1)}><ArrowDown /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-11 touch-none cursor-grab active:cursor-grabbing"
          ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Drag ${label} to reorder`}><GripVertical /></Button>
      </div>
    </li>
  );
}
