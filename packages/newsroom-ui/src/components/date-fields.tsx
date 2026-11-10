/**
 * Calendar-popover date and date-time fields, in place of the browser's native
 * date and datetime-local inputs (which look different in every browser, hide
 * the newsroom timezone and cannot be cleared on some platforms).
 *
 * Values are wall-clock strings, never instants: `YYYY-MM-DD` for a day and
 * `YYYY-MM-DDTHH:mm[:ss]` for a day and time. They are exactly what the native
 * inputs produced, so callers keep their own timezone conversion (the newsroom
 * reads times in `BYLINE_NEWSROOM_TIMEZONE`, never the browser's).
 */
import { CalendarClock, CalendarDays, CalendarRange, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { FormField, describedBy, type FieldChrome } from "./form-fields";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/;

/** Common newsroom clock times, so scheduling does not start with typing "09:00". */
export const TIME_PRESETS = [
  { time: "09:00", label: "9 AM" },
  { time: "12:00", label: "Noon" },
  { time: "15:00", label: "3 PM" },
  { time: "18:00", label: "6 PM" }
] as const;

export const DEFAULT_TIME = "09:00";

/** Split `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` into its day and clock parts; null when it is neither. */
export function splitWallTime(value: string | null | undefined): { day: string; time: string } | null {
  if (!value) return null;
  const wall = WALL.exec(value);
  if (wall) return { day: wall[1], time: `${wall[2]}${wall[3] ?? ""}` };
  return DAY.test(value) ? { day: value, time: "" } : null;
}

export function joinWallTime(day: string, time: string): string {
  return time ? `${day}T${time}` : day;
}

/** `YYYY-MM-DD` as a local noon Date, safe from any DST edge. */
export function dateFromDay(day: string): Date | undefined {
  const match = DAY.exec(day);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : undefined;
}

export function dayFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The wall-clock fields formatted as written: formatted in UTC so no timezone shifts them. */
export function formatWallTime(value: string | null | undefined, { withTime = true, locale }: { withTime?: boolean; locale?: string } = {}): string {
  const parts = splitWallTime(value);
  if (!parts) return "";
  const instant = new Date(`${parts.day}T${parts.time ? (parts.time.length === 5 ? `${parts.time}:00` : parts.time) : "12:00:00"}Z`);
  if (Number.isNaN(instant.getTime())) return "";
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(instant);
  if (!withTime || !parts.time) return day;
  return `${day} at ${new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(instant)}`;
}

/** "Eastern Standard Time" (or "EST" when `short`) for `America/New_York`; the id itself when the runtime does not know it. */
export function timeZoneLabel(timeZone: string, at: Date = new Date(), locale?: string, style: "long" | "short" = "long"): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

const COMPLETE_CLOCK = /^\d{2}:\d{2}(:\d{2})?$/;

/** An instant on `day` for naming its timezone: noon UTC is the same calendar day in every newsroom zone. */
const instantOnDay = (day: string): Date => (DAY.test(day) ? new Date(`${day}T12:00:00Z`) : new Date());

/**
 * How far the calendar's month and year dropdowns reach: back to 1980 (a migrated
 * story keeps its original date) and ten years ahead, widened to hold the value
 * already chosen.
 */
export function calendarBounds(selected?: Date, now: Date = new Date()): { startMonth: Date; endMonth: Date } {
  const year = selected?.getFullYear();
  return { startMonth: new Date(Math.min(1980, year ?? 1980), 0), endMonth: new Date(Math.max(now.getFullYear() + 10, year ?? 0), 11) };
}

type DateButtonProps = {
  id?: string;
  value: string;
  onChange: (day: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** Called with the latest value when the calendar closes, however it closed: commit a draft here instead of on every pick. */
  onClose?: (value: string) => void;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

/**
 * A bare day picker for dense filter bars: the same calendar popover as
 * `DateTimeField`, with no label chrome. Pair it with a visible label or an `aria-label`.
 */
export function DateButton({ id, value, onChange, placeholder = "Any date", disabled, clearable = true, onClose, className, ...aria }: DateButtonProps) {
  const [open, setOpen] = useState(false);
  const selected = dateFromDay(value);
  const latest = useRef(value);
  latest.current = value;
  const emit = (next: string) => { latest.current = next; onChange(next); };
  const change = (next: boolean) => { setOpen(next); if (!next) onClose?.(latest.current); };
  return <Popover open={open} onOpenChange={change}>
    <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className={className ?? "w-full justify-start font-normal"} {...aria} />}>
      <CalendarDays aria-hidden="true" className="text-muted-foreground" />
      <span className={value ? "truncate" : "truncate text-muted-foreground"}>{formatWallTime(value, { withTime: false }) || placeholder}</span>
    </PopoverTrigger>
    <PopoverContent className="w-auto gap-0 p-0 any-pointer-coarse:max-h-(--available-height) any-pointer-coarse:overflow-y-auto" align="start">
      <Calendar mode="single" captionLayout="dropdown" {...calendarBounds(selected)} selected={selected} defaultMonth={selected} onSelect={(date) => { if (date) { emit(dayFromDate(date)); change(false); } }} />
      {clearable && value ? <div className="border-t p-1.5"><Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { emit(""); change(false); }}>Clear date</Button></div> : null}
    </PopoverContent>
  </Popover>;
}

/** A labelled day picker (`FormField` chrome around `DateButton`). */
export function DateField({ label, value, onChange, error, hint, optional, ...rest }: FieldChrome & Omit<DateButtonProps, "id" | "aria-label" | "aria-invalid" | "aria-describedby">) {
  const id = useId();
  return <FormField id={id} label={label} error={error} hint={hint} optional={optional}>
    <DateButton id={id} value={value} onChange={onChange} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...rest} />
  </FormField>;
}

export type DateTimeFieldProps = FieldChrome & {
  /** `YYYY-MM-DDTHH:mm[:ss]`, or "" for no value. */
  value: string;
  onChange: (value: string) => void;
  /** The newsroom IANA timezone: shown beside the clock so nobody guesses. Never converts the value. */
  timeZone?: string;
  /** Allow second precision (the value keeps `:ss`). */
  seconds?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
  /** Called with the latest value when the popover closes, however it closed: commit a draft here instead of on every pick. */
  onClose?: (value: string) => void;
  /** The clock time a newly chosen day starts with. */
  defaultTime?: string;
  /** Shown above the calendar, e.g. "When should it publish?". */
  prompt?: ReactNode;
};

/**
 * A labelled day-and-time picker: calendar with month and year dropdowns, quick
 * times, an exact time input and the timezone it is read in.
 *
 * `onChange` receives a whole date-and-time or "", never half of one: a day
 * without a clock (or a clock being retyped) is held in the field, shown as
 * "pick a time", and reported as "" so a form cannot save it as some default
 * hour. Closing the popover on a half-finished pick puts back the value it was
 * opened with; "Clear" is the way to remove a value.
 */
export function DateTimeField({ label, value, onChange, timeZone, seconds = false, disabled, clearable = true, placeholder = "Choose a date and time", defaultTime = DEFAULT_TIME, prompt, onClose, error, hint, optional }: DateTimeFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ day: string; time: string } | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const baseline = useRef("");
  const emit = (next: string) => { latest.current = next; onChange(next); };
  const wholeValue = (candidate: string) => Boolean(splitWallTime(candidate)?.time);
  const change = (next: boolean) => {
    if (next) baseline.current = wholeValue(value) ? value : "";
    else {
      if (!wholeValue(latest.current) && latest.current !== baseline.current) emit(baseline.current);
      setDraft(null);
    }
    setOpen(next);
    if (!next) onClose?.(latest.current);
  };
  const parts = splitWallTime(value);
  const complete = Boolean(parts?.time);
  const day = parts?.day ?? draft?.day ?? "";
  const clock = parts ? parts.time : draft?.time ?? "";
  const selected = day ? dateFromDay(day) : undefined;
  const at = instantOnDay(day);
  const zone = timeZone ? timeZoneLabel(timeZone, at) : "";
  const shortZone = timeZone ? timeZoneLabel(timeZone, at, undefined, "short") : "";
  const startClock = seconds ? `${defaultTime}:00` : defaultTime;
  const choose = (nextDay: string, nextClock: string) => {
    if (nextDay && COMPLETE_CLOCK.test(nextClock)) {
      setDraft(null);
      emit(joinWallTime(nextDay, nextClock));
    } else {
      setDraft({ day: nextDay, time: nextClock });
      if (latest.current) emit("");
    }
  };
  return <FormField id={id} label={label} error={error} hint={hint} optional={optional}>
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-start font-normal" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} />}>
        <CalendarClock aria-hidden="true" className="text-muted-foreground" />
        {complete ? <span className="truncate">{formatWallTime(value)}</span> : day ? <span className="truncate">{formatWallTime(day, { withTime: false })}<span className="text-muted-foreground"> · pick a time</span></span> : <span className="truncate text-muted-foreground">{placeholder}</span>}
        {shortZone && complete ? <span title={zone} className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{shortZone}</span> : null}
      </PopoverTrigger>
      <PopoverContent className="w-auto gap-0 p-0 any-pointer-coarse:max-h-(--available-height) any-pointer-coarse:overflow-y-auto" align="start">
        {prompt ? <p className="max-w-64 border-b px-3 py-2 text-xs text-muted-foreground">{prompt}</p> : null}
        <Calendar mode="single" captionLayout="dropdown" {...calendarBounds(selected)} selected={selected} defaultMonth={selected} onSelect={(date) => { if (date) choose(dayFromDate(date), COMPLETE_CLOCK.test(clock) ? clock : startClock); }} />
        <div className="grid gap-2 border-t p-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-time`} className="text-xs font-medium">Time</label>
            <Input id={`${id}-time`} type="time" step={seconds ? 1 : 60} className="h-7 w-auto" disabled={!day} value={clock} aria-invalid={day && !complete ? true : undefined} onChange={(event) => choose(day, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); change(false); } }} />
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Quick times">
            {TIME_PRESETS.map((preset) => {
              const time = seconds ? `${preset.time}:00` : preset.time;
              return <Button key={preset.time} type="button" size="xs" variant={clock === time ? "secondary" : "outline"} disabled={!day} aria-pressed={clock === time} onClick={() => choose(day, time)}>{preset.label}</Button>;
            })}
          </div>
          {zone ? <p className="text-xs text-muted-foreground">Times are in {zone}.</p> : null}
          {!day ? <p className="text-xs text-muted-foreground">Pick a day first.</p> : !complete ? <p role="status" className="text-xs text-muted-foreground">Enter a time to finish, or Done keeps the previous one.</p> : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-1.5">
          {clearable && (value || draft) ? <Button type="button" variant="ghost" size="sm" onClick={() => { baseline.current = ""; setDraft(null); if (latest.current) emit(""); change(false); }}><X aria-hidden="true" data-icon="inline-start" />Clear</Button> : <span />}
          <Button type="button" size="sm" onClick={() => change(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  </FormField>;
}

/** `day` moved by `days` calendar days (`YYYY-MM-DD`), never through a timezone. */
export function addDays(day: string, days: number): string {
  const date = dateFromDay(day);
  if (!date) return day;
  date.setDate(date.getDate() + days);
  return dayFromDate(date);
}

export type RangePreset = "today" | "last7" | "next7" | "month";

/** The first and last day of a named range, relative to `today` (`YYYY-MM-DD` in the newsroom's timezone). */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case "today": return { from: today, to: today };
    case "last7": return { from: addDays(today, -6), to: today };
    case "next7": return { from: today, to: addDays(today, 6) };
    case "month": {
      const [year, month] = today.split("-").map(Number);
      const last = new Date(year, month, 0).getDate();
      return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}` };
    }
  }
}

const PRESET_LABELS: Record<RangePreset, string> = { today: "Today", last7: "Last 7 days", next7: "Next 7 days", month: "This month" };

export function rangeText(from: string, to: string, placeholder = "Any date"): string {
  const short = (day: string) => formatWallTime(day, { withTime: false }).replace(/^\w+, /, "");
  if (from && to) return from === to ? short(from) : `${short(from)} – ${short(to)}`;
  if (from) return `From ${short(from)}`;
  if (to) return `Until ${short(to)}`;
  return placeholder;
}

type RangeMode = "between" | "from" | "until";
const RANGE_MODES: Array<{ value: RangeMode; label: string; hint: string }> = [
  { value: "between", label: "Between", hint: "Pick the first day, then the last." },
  { value: "from", label: "From", hint: "Everything from this day on." },
  { value: "until", label: "Until", hint: "Everything up to and including this day." }
];
const modeFor = (from: string, to: string): RangeMode => (from && !to ? "from" : !from && to ? "until" : "between");

/**
 * One calendar for a filter's first and last day, either of which may be left
 * open: "Between" picks both, "From" only a start and "Until" only an end. Quick
 * ranges appear when `today` (the newsroom's day) is known.
 */
export function DateRangeButton({ from, to, onChange, today, presets = ["today", "next7", "month"], placeholder = "Any date", disabled, id, className, ...aria }: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  today?: string;
  presets?: RangePreset[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RangeMode>(() => modeFor(from, to));
  const start = dateFromDay(from);
  const end = dateFromDay(to);
  const selected: DateRange | undefined = start ? { from: start, to: end } : undefined;
  const active = Boolean(from || to);
  const bounds = calendarBounds(mode === "until" ? end : start);
  const hint = RANGE_MODES.find((item) => item.value === mode)?.hint;
  return <Popover open={open} onOpenChange={(next) => { if (next) setMode(modeFor(from, to)); setOpen(next); }}>
    <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className={className ?? "w-full justify-start font-normal"} {...aria} />}>
      <CalendarRange aria-hidden="true" className="text-muted-foreground" />
      <span className={active ? "truncate" : "truncate text-muted-foreground"}>{rangeText(from, to, placeholder)}</span>
    </PopoverTrigger>
    <PopoverContent className="w-auto gap-0 p-0 any-pointer-coarse:max-h-(--available-height) any-pointer-coarse:overflow-y-auto" align="start">
      {today && presets.length ? <div className="flex flex-wrap gap-1 border-b p-2" role="group" aria-label="Quick ranges">
        {presets.map((preset) => {
          const range = presetRange(preset, today);
          return <Button key={preset} type="button" size="xs" variant={range.from === from && range.to === to ? "secondary" : "outline"} onClick={() => { onChange(range.from, range.to); setOpen(false); }}>{PRESET_LABELS[preset]}</Button>;
        })}
      </div> : null}
      <div className="border-b p-2">
        <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Kind of date range" value={[mode]} onValueChange={(next: unknown[]) => { const value = next[0]; if (value === "between" || value === "from" || value === "until") setMode(value); }}>
          {RANGE_MODES.map((item) => <ToggleGroupItem key={item.value} value={item.value}>{item.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      {mode === "between"
        ? <Calendar mode="range" resetOnSelect captionLayout="dropdown" {...bounds} selected={selected} defaultMonth={start} onSelect={(range) => {
          if (!range?.from) return;
          const first = dayFromDate(range.from);
          if (range.to) { onChange(first, dayFromDate(range.to)); setOpen(false); } else onChange(first, "");
        }} />
        : <Calendar key={mode} mode="single" captionLayout="dropdown" {...bounds} selected={mode === "from" ? start : end} defaultMonth={mode === "from" ? start : end} onSelect={(date) => {
          if (!date) return;
          onChange(mode === "from" ? dayFromDate(date) : "", mode === "until" ? dayFromDate(date) : "");
          setOpen(false);
        }} />}
      <div className="flex items-center justify-between gap-2 border-t p-1.5">
        <p className="max-w-52 px-1.5 text-xs text-muted-foreground">{hint}</p>
        {active ? <Button type="button" variant="ghost" size="sm" onClick={() => { onChange("", ""); setOpen(false); }}><X aria-hidden="true" data-icon="inline-start" />Clear</Button> : null}
      </div>
    </PopoverContent>
  </Popover>;
}
