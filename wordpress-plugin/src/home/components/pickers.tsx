import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { ContributorEntry } from "../../editorial/editorial-model";
import { contributorKey } from "../../editorial/editorial-model";
import { PersonAvatar } from "./rows";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty, ComboboxChips, ComboboxChip, ComboboxChipsInput } from "../ui/combobox";
import { exactDate, siteDay } from "../newsroom-model";

export function WritersPicker({ people, value, onChange, disabled }: { people: ContributorEntry[]; value: ContributorEntry[]; onChange: (value: ContributorEntry[]) => void; disabled?: boolean }) {
  const anchor = useRef<HTMLDivElement | null>(null);
  return <Combobox multiple items={people} value={value} onValueChange={onChange} itemToStringLabel={(p) => p.name} isItemEqualToValue={(a, b) => contributorKey(a) === contributorKey(b)} disabled={disabled}>
    <ComboboxChips ref={anchor} className="home-writer-chips">
      {value.map((person) => <ComboboxChip key={contributorKey(person)} aria-label={`Remove ${person.name}`}><span>{person.name}</span></ComboboxChip>)}
      <ComboboxChipsInput aria-label="Writers" placeholder={value.length ? "Add writer…" : "Choose writers…"} />
    </ComboboxChips>
    <ComboboxContent anchor={anchor}><ComboboxEmpty>No writers found.</ComboboxEmpty><ComboboxList>{(person: ContributorEntry) => <ComboboxItem key={contributorKey(person)} value={person}><PersonAvatar name={person.name} url={person.imageUrl} />{person.name}</ComboboxItem>}</ComboboxList></ComboboxContent>
  </Combobox>;
}

export function AssigneePicker({ people, value, onChange, disabled }: { people: ContributorEntry[]; value: ContributorEntry | null; onChange: (value: ContributorEntry | null) => void; disabled?: boolean }) {
  return <Combobox items={people} value={value} onValueChange={onChange} itemToStringLabel={(p) => p.name} isItemEqualToValue={(a, b) => a.id === b.id} disabled={disabled}>
    <ComboboxInput aria-label="Assignee" placeholder="Choose an assignee…" showClear />
    <ComboboxContent><ComboboxEmpty>No assignees found.</ComboboxEmpty><ComboboxList>{(person: ContributorEntry) => <ComboboxItem key={String(person.id)} value={person}><PersonAvatar name={person.name} url={person.imageUrl} />{person.name}</ComboboxItem>}</ComboboxList></ComboboxContent>
  </Combobox>;
}

export function DatePicker({ label, value, timezone, onChange, disabled, dateOnly = false }: { label: string; value?: string | null; timezone: string; onChange: (date: string | null) => void; disabled?: boolean; dateOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const day = value ? siteDay(value, timezone) : "";
  const selected = day ? new Date(`${day}T12:00:00`) : undefined;
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<Button variant="ghost" className="home-date-trigger" disabled={disabled} aria-label={`Change ${label.toLowerCase()}`} />}><CalendarDays size={14} />{exactDate(value, timezone)}</PopoverTrigger><PopoverContent className="home-calendar-popover" align="start"><Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(date) => {
    if (date) {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      // Offset-free timestamps are interpreted by the canonical PHP domain in
      // the site timezone, independent of this browser's timezone.
      let time = "12:00:00";
      if (!dateOnly && value?.includes("T")) time = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
      onChange(dateOnly ? key : `${key}T${time}`);
    } else onChange(null);
    setOpen(false);
  }} /><Button variant="ghost" onClick={() => { onChange(null); setOpen(false); }}>Clear date</Button></PopoverContent></Popover>;
}
