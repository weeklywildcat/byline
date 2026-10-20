/**
 * Newsroom pickers shared by Home and the Story Workspace: one person, several
 * writers, one date. Each opens from a trigger. `appearance="value"` makes the
 * trigger read as the value itself (for property lists); `"field"` makes it a
 * normal outlined control (for forms).
 */
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { contributorKey, type ContributorEntry } from "../../editorial/editorial-model";
import { exactDate, siteDay } from "../../home/newsroom-model";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "../ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { PeopleAvatars } from "./people-avatars";
import { PersonAvatar } from "./person-avatar";

export type PickerAppearance = "field" | "value";

/** Nova's ghost button, pulled left so the value lines up with plain text; the chevron appears on hover. */
export const valueTriggerClass = "-ml-2 h-auto min-h-7 max-w-full justify-start px-2 py-1 text-left font-normal whitespace-normal [&_svg]:opacity-0 hover:[&_svg]:opacity-100 focus-visible:[&_svg]:opacity-100 aria-expanded:[&_svg]:opacity-100";
/** The same look for a Select trigger in a property list. */
export const valueSelectTriggerClass = "-ml-2 h-7 w-fit max-w-full border-transparent bg-transparent px-2 hover:bg-muted data-popup-open:bg-muted dark:bg-transparent [&_svg]:opacity-0 hover:[&_svg]:opacity-100 focus-visible:[&_svg]:opacity-100 data-popup-open:[&_svg]:opacity-100";
/** Class names that turn native horizontal Fields into a label column plus a value, for story facts. */
export const fieldRow = {
  field: "min-h-7 items-center!",
  label: "w-36 flex-none! font-normal text-muted-foreground",
  value: "min-w-0 text-sm [overflow-wrap:anywhere]"
} as const;
const fieldTriggerClass = "w-full justify-between font-normal";

function triggerProps(appearance: PickerAppearance, className?: string) {
  return { variant: appearance === "value" ? "ghost" : "outline", className: cn(appearance === "value" ? valueTriggerClass : fieldTriggerClass, className) } as const;
}

const muted = (text: string) => <span className="truncate text-muted-foreground">{text}</span>;

export function AssigneePicker({ id, people, value, onChange, disabled, label = "Assignee", placeholder = "Choose an assignee", appearance = "field", clearable = true }: { id?: string; people: ContributorEntry[]; value: ContributorEntry | null; onChange: (value: ContributorEntry | null) => void; disabled?: boolean; label?: string; placeholder?: string; appearance?: PickerAppearance; clearable?: boolean }) {
  return <Combobox items={people} value={value} onValueChange={onChange} itemToStringLabel={(person: ContributorEntry) => person.name} isItemEqualToValue={(a: ContributorEntry, b: ContributorEntry) => a.id === b.id} disabled={disabled}>
    <ComboboxTrigger render={<Button id={id} {...triggerProps(appearance)} aria-label={`${label}: ${value?.name ?? "none"}`} disabled={disabled} />}>
      {value ? <span className="flex min-w-0 items-center gap-2"><PersonAvatar name={value.name} url={value.imageUrl} /><span className="truncate">{value.name}</span></span> : muted(placeholder)}
    </ComboboxTrigger>
    <ComboboxContent>
      <ComboboxInput showTrigger={false} showClear={clearable} aria-label={`Search ${label.toLowerCase()}`} placeholder="Search people…" />
      <ComboboxEmpty>No one found.</ComboboxEmpty>
      <ComboboxList>{(person: ContributorEntry) => <ComboboxItem key={String(person.id)} value={person}><PersonAvatar name={person.name} url={person.imageUrl} />{person.name}</ComboboxItem>}</ComboboxList>
    </ComboboxContent>
  </Combobox>;
}

export function WritersPicker({ people, value, onChange, disabled, appearance = "value" }: { people: ContributorEntry[]; value: ContributorEntry[]; onChange: (value: ContributorEntry[]) => void; disabled?: boolean; appearance?: PickerAppearance }) {
  const names = value.map((person) => person.name).join(", ");
  return <Combobox multiple items={people} value={value} onValueChange={onChange} itemToStringLabel={(person: ContributorEntry) => person.name} isItemEqualToValue={(a: ContributorEntry, b: ContributorEntry) => contributorKey(a) === contributorKey(b)} disabled={disabled}>
    <ComboboxTrigger render={<Button {...triggerProps(appearance)} aria-label={`Writers: ${names || "none"}`} disabled={disabled} />}>
      {value.length ? <span className="flex min-w-0 items-center gap-2"><PeopleAvatars people={value} tooltips={false} /><span className="truncate">{names}</span></span> : muted("Add writers")}
    </ComboboxTrigger>
    <ComboboxContent>
      <ComboboxInput showTrigger={false} aria-label="Search writers" placeholder="Search writers…" />
      <ComboboxEmpty>No writers found.</ComboboxEmpty>
      <ComboboxList>{(person: ContributorEntry) => <ComboboxItem key={contributorKey(person)} value={person}><PersonAvatar name={person.name} url={person.imageUrl} />{person.name}</ComboboxItem>}</ComboboxList>
    </ComboboxContent>
  </Combobox>;
}

/** A date (or date and time) stored as an offset-free site-local value. */
export function DatePicker({ id, label, value, timezone, onChange, disabled, dateOnly = false, appearance = "field", placeholder = "Set date" }: { id?: string; label: string; value?: string | null; timezone: string; onChange: (date: string | null) => void; disabled?: boolean; dateOnly?: boolean; appearance?: PickerAppearance; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const day = value ? siteDay(value, timezone) : "";
  const selected = day ? new Date(`${day}T12:00:00`) : undefined;
  const text = value ? exactDate(value, timezone) : "";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button id={id} {...triggerProps(appearance, appearance === "field" ? "justify-start" : undefined)} disabled={disabled} aria-label={`Change ${label.toLowerCase()}`} />}>
      <CalendarDays aria-hidden="true" className={appearance === "value" ? "hidden" : "text-muted-foreground"} />
      <span className={cn("truncate", !text && "text-muted-foreground")}>{text || placeholder}</span>
    </PopoverTrigger>
    <PopoverContent className="w-auto gap-0 p-0" align="start">
      <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(date) => {
        if (date) {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          // Offset-free timestamps are interpreted by the canonical PHP domain in
          // the site timezone, independent of this browser's timezone.
          let time = "12:00:00";
          if (!dateOnly && value?.includes("T")) time = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
          onChange(dateOnly ? key : `${key}T${time}`);
        } else onChange(null);
        setOpen(false);
      }} />
      {value ? <div className="border-t p-1.5"><Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { onChange(null); setOpen(false); }}>Clear date</Button></div> : null}
    </PopoverContent>
  </Popover>;
}
