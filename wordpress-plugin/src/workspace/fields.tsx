/** Workspace-specific form fields: `YYYY-MM-DD` day values and the capped assignee picker. */
import { useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { ContributorEntry } from "../editorial/editorial-model";
import { PersonAvatar } from "../admin-ui/components/person-avatar";
import { FormField, describedBy, type FieldChrome } from "../admin-ui/components/form-fields";
import { Button } from "../admin-ui/ui/button";
import { Calendar } from "../admin-ui/ui/calendar";
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList } from "../admin-ui/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "../admin-ui/ui/popover";
import { dayFromLocalDate, localDateFromDay } from "./appointment-form";
import { MAX_ASSIGNEES } from "./reporting-model";
import { formatLongDay, peopleForIds } from "./workspace-model";

/** Calendar-popover date field. Values are `YYYY-MM-DD` calendar days; never timezone instants. */
export function DayField({ label, value, onChange, disabled, clearable = true, error, hint, optional, placeholder = "Choose a date" }: FieldChrome & { value: string; onChange: (day: string) => void; disabled?: boolean; clearable?: boolean; placeholder?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = localDateFromDay(value);
  return <FormField id={id} label={label} error={error} hint={hint} optional={optional}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-start font-normal aria-invalid:border-destructive" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} />}>
        <CalendarDays aria-hidden="true" className="text-muted-foreground" />
        <span className={value ? undefined : "text-muted-foreground"}>{value ? formatLongDay(value) : placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto gap-0 p-0" align="start">
        <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(date) => { if (date) { onChange(dayFromLocalDate(date)); setOpen(false); } }} />
        {clearable && value ? <div className="border-t p-1.5"><Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { onChange(""); setOpen(false); }}>Clear date</Button></div> : null}
      </PopoverContent>
    </Popover>
  </FormField>;
}


/** Choose up to `max` people. Existing people not in `options` stay selectable only as already chosen. */
export function PeoplePicker({ label, options, value, onChange, max = MAX_ASSIGNEES, disabled, error, hint }: FieldChrome & { options: ContributorEntry[]; value: number[]; onChange: (ids: number[]) => void; max?: number; disabled?: boolean }) {
  const id = useId();
  const anchor = useRef<HTMLDivElement | null>(null);
  const selected = peopleForIds(value, options);
  const full = selected.length >= max;
  const note = hint ?? (full ? `Up to ${max} people.` : undefined);
  return <FormField id={id} label={label} error={error} hint={note}>
    <Combobox multiple items={options} value={selected} onValueChange={(next: ContributorEntry[]) => { if (next.length <= max) onChange(next.map((person) => Number(person.id))); }} itemToStringLabel={(person: ContributorEntry) => person.name} isItemEqualToValue={(a: ContributorEntry, b: ContributorEntry) => Number(a.id) === Number(b.id)} disabled={disabled}>
      <ComboboxChips ref={anchor}>
        {selected.map((person) => <ComboboxChip key={String(person.id)} aria-label={`Remove ${person.name}`}><span>{person.name}</span></ComboboxChip>)}
        <ComboboxChipsInput id={id} placeholder={selected.length ? (full ? "" : "Add…") : "Choose people…"} aria-invalid={error ? true : undefined} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No one found.</ComboboxEmpty>
        <ComboboxList>{(person: ContributorEntry) => <ComboboxItem key={String(person.id)} value={person} disabled={full && !selected.some((chosen) => Number(chosen.id) === Number(person.id))}><PersonAvatar name={person.name} url={person.imageUrl} />{person.name}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  </FormField>;
}
