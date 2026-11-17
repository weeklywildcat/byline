"use client";

import { Field, FieldContent, FieldDescription, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useId } from "react";

/**
 * Poll Studio's small compositions of the newsroom-ui (shadcn) kit, for the
 * controls the shared `FormField` helpers don't cover: a compact Select with an
 * empty choice, and a Switch row.
 */

const NONE = "__none__";

export type SelectOption = { value: string; label: string };

/** A shadcn Select whose empty value ("") is a real, labelled choice ("None", "All", "Choose…"). */
export function PollSelect({ value, options, onChange, label, emptyLabel, id, className, disabled }: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** The accessible name when no FieldLabel points at `id`. */
  label?: string;
  /** Offer "" as a choice with this label. */
  emptyLabel?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  const items = [...(emptyLabel ? [{ value: NONE, label: emptyLabel }] : []), ...options];
  return (
    <Select items={items} value={value || (emptyLabel ? NONE : null)} disabled={disabled} onValueChange={(next) => onChange(next === NONE || next === null ? "" : String(next))}>
      <SelectTrigger id={id} aria-label={label} className={cn("w-full min-w-0", className)}><SelectValue placeholder="Choose…" /></SelectTrigger>
      <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** A labelled Switch in a horizontal Field, with an optional sentence about what it does. */
export function SwitchField({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </Field>
  );
}
