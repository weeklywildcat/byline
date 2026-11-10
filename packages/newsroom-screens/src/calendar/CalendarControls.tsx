import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { TZDate } from "react-day-picker";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Calendar } from "@byline/newsroom-ui/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator } from "@byline/newsroom-ui/ui/sidebar";
import { siteDay } from "../home/newsroom-model";
import { CALENDAR_CATEGORY_FILTERS, type CalendarCategoryFilter } from "./calendar-model";
import { CATEGORY_DOT_CLASSES } from "./calendar-events";
import { selectedDay } from "./calendar-workspace";
import { useCalendarWorkspace } from "./calendar-workspace-context";
import { FILTER_CATEGORY } from "./schedule-x-adapter";

export type CalendarControlsProps = {
  /** The newsroom timezone. The mini calendar's days are this timezone's days, never the browser's. */
  timezone: string;
  /** Whether the host has a schedule feed: without one, appointment, production and task toggles and My schedule are not offered. */
  scheduleFeed: boolean;
  currentUserId: number | null;
  /** Called after the reader picks a day (a temporary sheet closes itself). */
  onDatePicked?: () => void;
};

/** A newsroom-local `YYYY-MM-DD` as the day-picker's date in that timezone. */
function zonedDay(day: Temporal.PlainDate, timezone: string): Date {
  return new TZDate(day.year, day.month - 1, day.day, 12, timezone);
}

/**
 * The Calendar's controls, after shadcn sidebar-12: a mini month that moves
 * the main calendar, then the newsroom's real categories as selectable rows.
 * The same component is the wide Calendar workspace's contextual pane and the
 * narrow screens' temporary sheet; both read and write the one Calendar
 * workspace, so they can never disagree. Built from sidebar group and menu
 * primitives, which work with or without a surrounding sidebar.
 */
export function CalendarControls({ timezone, scheduleFeed, currentUserId, onDatePicked }: CalendarControlsProps) {
  const { workspace, state } = useCalendarWorkspace();
  const selected = selectedDay(state, timezone);
  const selectedKey = selected.toString();
  // The month on show follows the selected day; the reader may page the mini calendar on its own.
  const [month, setMonth] = useState(() => zonedDay(selected, timezone));
  useEffect(() => { setMonth(zonedDay(Temporal.PlainDate.from(selectedKey), timezone)); }, [selectedKey, timezone]);
  const categories = CALENDAR_CATEGORY_FILTERS.filter((item) => scheduleFeed || !item.scheduleFeed);

  return (
    <div className="flex min-h-0 flex-col" data-calendar-controls="">
      <SidebarGroup className="px-0 pt-0">
        <SidebarGroupContent className="@container flex justify-center">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            timeZone={timezone}
            selected={zonedDay(selected, timezone)}
            month={month}
            onMonthChange={setMonth}
            required
            onSelect={(date: Date | undefined) => {
              if (!date) return;
              const day = siteDay(date, timezone);
              if (!day) return;
              workspace.setDate(Temporal.PlainDate.from(day));
              onDatePicked?.();
            }}
            className="bg-transparent [--cell-size:2.1rem] any-pointer-coarse:p-0 any-pointer-coarse:[--cell-size:min(--spacing(11),100cqi/7)]"
            aria-label="Choose a date"
          />
        </SidebarGroupContent>
      </SidebarGroup>
      {scheduleFeed ? (
        <>
          <SidebarSeparator className="mx-0" />
          <SidebarGroup>
            <SidebarGroupLabel>Whose work</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <ToggleRow checked={state.filters.mine} disabled={!currentUserId} onToggle={(next) => workspace.setFilter("mine", next)} label="My schedule" description="Only my appointments, production and tasks" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </>
      ) : null}
      <SidebarSeparator className="mx-0" />
      <ShowGroup>
        {categories.map((item) => (
          <ToggleRow key={item.key} checked={state.filters[item.key]} onToggle={(next) => workspace.setFilter(item.key, next)} label={item.label} dot={dotFor(item.key)} />
        ))}
      </ShowGroup>
    </div>
  );
}

const dotFor = (key: CalendarCategoryFilter) => CATEGORY_DOT_CLASSES[FILTER_CATEGORY[key]];

function ShowGroup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          Show
          <ChevronRight aria-hidden="true" className={cn("ml-auto transition-transform", open && "rotate-90")} />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Show on calendar">{children}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

/**
 * One category: the whole row is a checkbox. The square shows the state (a
 * check, not only a fill), the dot ties it to the colour of its events.
 */
function ToggleRow({ checked, onToggle, label, description, dot, disabled }: { checked: boolean; onToggle: (next: boolean) => void; label: string; description?: string; dot?: string; disabled?: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        role="checkbox"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        title={description}
        onClick={() => { if (!disabled) onToggle(!checked); }}
        data-filter-row=""
        className="aria-disabled:opacity-50"
      >
        <span
          aria-hidden="true"
          data-checked={checked}
          className="flex aspect-square size-4 shrink-0 items-center justify-center rounded-sm border border-sidebar-border text-sidebar-primary-foreground data-[checked=true]:border-sidebar-primary data-[checked=true]:bg-sidebar-primary"
        >
          {checked ? <Check className="size-3" /> : null}
        </span>
        <span className="truncate">{label}</span>
        {dot ? <span aria-hidden="true" className={cn("ml-auto size-2 shrink-0 rounded-full", dot)} /> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
