/**
 * Small shared building blocks for the workspace: headings, form fields, the
 * schedule segmented control, the date field and the people picker. Primitives
 * come from Home's Mira set; nothing here is copied from it.
 */
import { useId, useRef, useState, type ReactNode } from "react";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { CalendarDays, ChevronDown, Plus } from "lucide-react";
import type { ContributorEntry } from "../editorial/editorial-model";
import { Badge } from "../home/ui/badge";
import { Button } from "../home/ui/button";
import { Calendar } from "../home/ui/calendar";
import { Field, FieldError, FieldLabel } from "../home/ui/field";
import { Input } from "../home/ui/input";
import { Textarea } from "../home/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "../home/ui/popover";
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList } from "../home/ui/combobox";
import { PersonAvatar } from "../home/components/rows";
import { cn } from "../home/lib/utils";
import { dayFromLocalDate, localDateFromDay } from "./appointment-form";
import { MAX_ASSIGNEES } from "./reporting-model";
import { formatLongDay, peopleForIds } from "./workspace-model";

/* ------------------------------------------------------------ headings */

export function SectionHeading({ id, title, children, level = 2 }: { id?: string; title: string; children?: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return <header className={cn("ws-section-head", level === 3 && "ws-section-head-sub")}><Heading id={id}>{title}</Heading>{children ? <div className="ws-section-actions">{children}</div> : null}</header>;
}

export function AddButton({ children, ...props }: { children: ReactNode } & Omit<React.ComponentProps<typeof Button>, "children">) {
  return <Button type="button" variant="ghost" size="sm" className="ws-add" {...props}><Plus aria-hidden="true" />{children}</Button>;
}

/** Inline metadata joined by middots so it wraps like text rather than as separate boxes. */
export function Meta({ parts, flag }: { parts: Array<string | false | null | undefined>; flag?: (index: number) => boolean }) {
  const shown = parts.filter((part): part is string => Boolean(part));
  if (!shown.length) return null;
  return <span className="ws-row-meta">{shown.map((part, index) => <span key={index}>{index > 0 ? " · " : ""}<span className={flag?.(index) ? "ws-hintline" : undefined}>{part}</span></span>)}</span>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="ws-empty">{children}</p>;
}

export function InlineError({ children, onRetry, retryLabel = "Try again" }: { children: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return <p className="ws-inline-error" role="alert">{children}{onRetry ? <> <Button type="button" variant="link" onClick={onRetry}>{retryLabel}</Button></> : null}</p>;
}

/** A section that failed to load on the server; the rest of the page still works. */
export function SectionFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return <InlineError onRetry={onRetry}>Couldn't load {what}.</InlineError>;
}

/* -------------------------------------------------------------- badges */

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "attention" | "muted" | "done" }) {
  return <Badge variant="outline" className={cn("ws-badge", `ws-badge-${tone}`)}>{children}</Badge>;
}

/* -------------------------------------------------------------- fields */

type FieldFrameProps = { id: string; label: string; error?: string; hint?: ReactNode; optional?: boolean; children: ReactNode; className?: string };

export function FieldFrame({ id, label, error, hint, optional, children, className }: FieldFrameProps) {
  return <Field className={cn("ws-field", className)} data-invalid={error ? "true" : undefined}>
    <FieldLabel htmlFor={id}>{label}{optional ? <span className="ws-optional">Optional</span> : null}</FieldLabel>
    {children}
    {hint && !error ? <p className="ws-hint">{hint}</p> : null}
    {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
  </Field>;
}

export function TextField({ label, value, onChange, error, hint, optional, maxLength, autoFocus, disabled, placeholder, name }: { label: string; value: string; onChange: (value: string) => void; error?: string; hint?: ReactNode; optional?: boolean; maxLength?: number; autoFocus?: boolean; disabled?: boolean; placeholder?: string; name?: string }) {
  const id = useId();
  return <FieldFrame id={id} label={label} error={error} hint={hint} optional={optional}>
    <Input id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} autoFocus={autoFocus} disabled={disabled} placeholder={placeholder} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="ws-input" />
  </FieldFrame>;
}

export function TextAreaField({ label, value, onChange, error, maxLength, optional, rows = 3, disabled, hint, autoFocus }: { label: string; value: string; onChange: (value: string) => void; error?: string; maxLength: number; optional?: boolean; rows?: number; disabled?: boolean; hint?: ReactNode; autoFocus?: boolean }) {
  const id = useId();
  return <FieldFrame id={id} label={label} error={error} optional={optional} hint={hint}>
    <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} rows={rows} disabled={disabled} autoFocus={autoFocus} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="ws-textarea" />
    {value.length > maxLength * 0.85 ? <span className="ws-count" aria-live="polite">{value.length}/{maxLength}</span> : null}
  </FieldFrame>;
}

export function SelectField<T extends string>({ label, value, options, onChange, disabled, error }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean; error?: string }) {
  const id = useId();
  return <FieldFrame id={id} label={label} error={error}>
    <div className="ws-select-wrap">
      <select id={id} className="ws-select" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" />
    </div>
  </FieldFrame>;
}

/** Calendar-popover date field. Values are `YYYY-MM-DD` calendar days; never timezone instants. */
export function DayField({ label, value, onChange, disabled, clearable = true, error, placeholder = "Choose a date", hint }: { label: string; value: string; onChange: (day: string) => void; disabled?: boolean; clearable?: boolean; error?: string; placeholder?: string; hint?: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = localDateFromDay(value);
  return <FieldFrame id={id} label={label} error={error} hint={hint}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className="ws-day-trigger" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />}>
        <CalendarDays aria-hidden="true" />
        <span>{value ? formatLongDay(value) : placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="ws-calendar-popover" align="start">
        <Calendar mode="single" selected={selected} defaultMonth={selected} className="ws-calendar" onSelect={(date) => { if (date) { onChange(dayFromLocalDate(date)); setOpen(false); } }} />
        {clearable && value ? <Button type="button" variant="ghost" onClick={() => { onChange(""); setOpen(false); }}>Clear date</Button> : null}
      </PopoverContent>
    </Popover>
  </FieldFrame>;
}

export function TimeField({ label, value, onChange, error, disabled, optional }: { label: string; value: string; onChange: (value: string) => void; error?: string; disabled?: boolean; optional?: boolean }) {
  const id = useId();
  return <FieldFrame id={id} label={label} error={error} optional={optional}>
    <Input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="ws-input ws-time-input" />
  </FieldFrame>;
}

/** A radio group drawn as one connected segmented control. Arrow keys move the choice. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="ws-field">
    <span className="ws-field-label" id={`${id}-label`}>{label}</span>
    <RadioGroup aria-labelledby={`${id}-label`} value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled} className="ws-segmented">
      {options.map((option) => <Radio.Root key={option.value} value={option.value} className="ws-segment">{option.label}</Radio.Root>)}
    </RadioGroup>
  </div>;
}

/** Choose up to `max` people. Existing people not in `options` stay selectable only as already chosen. */
export function PeoplePicker({ label, options, value, onChange, max = MAX_ASSIGNEES, disabled, error, hint }: { label: string; options: ContributorEntry[]; value: number[]; onChange: (ids: number[]) => void; max?: number; disabled?: boolean; error?: string; hint?: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLDivElement | null>(null);
  const selected = peopleForIds(value, options);
  const full = selected.length >= max;
  return <FieldFrame id={id} label={label} error={error} hint={hint ?? (full ? `Up to ${max} people.` : undefined)}>
    <Combobox multiple items={options} value={selected} onValueChange={(next: ContributorEntry[]) => { if (next.length <= max) onChange(next.map((person) => Number(person.id))); }} itemToStringLabel={(person: ContributorEntry) => person.name} isItemEqualToValue={(a: ContributorEntry, b: ContributorEntry) => Number(a.id) === Number(b.id)} disabled={disabled}>
      <ComboboxChips ref={anchor} className="ws-chips">
        {selected.map((person) => <ComboboxChip key={String(person.id)} aria-label={`Remove ${person.name}`}><span>{person.name}</span></ComboboxChip>)}
        <ComboboxChipsInput id={id} placeholder={selected.length ? (full ? "" : "Add…") : "Choose people…"} aria-invalid={error ? true : undefined} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No one found.</ComboboxEmpty>
        <ComboboxList>{(person: ContributorEntry) => <ComboboxItem key={String(person.id)} value={person} disabled={full && !selected.some((chosen) => Number(chosen.id) === Number(person.id))}><PersonAvatar name={person.name} url={person.imageUrl} />{person.name}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  </FieldFrame>;
}
