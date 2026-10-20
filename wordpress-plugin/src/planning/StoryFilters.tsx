import { useState, type ReactNode } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { Badge } from "../admin-ui/ui/badge";
import { Button } from "../admin-ui/ui/button";
import { Checkbox } from "../admin-ui/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../admin-ui/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "../admin-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { EMPTY_PLANNING_FILTERS, normalizePlanningFilters, type PlanningFilters, type PlanningPerson, type PlanningWorkflowStatus } from "./planning-model";

type Option = { value: string; label: string };
const ALL = "__all";

const WORDPRESS_STATES: Option[] = [
  { value: ALL, label: "Any WordPress state" },
  { value: "draft", label: "Draft" },
  { value: "future", label: "Scheduled" },
  { value: "publish", label: "Published" }
];
const VISUAL_STATUSES: Option[] = [
  { value: ALL, label: "Any visual status" },
  { value: "needed", label: "Needed" },
  { value: "assigned", label: "Assigned" },
  { value: "in-progress", label: "In progress" },
  { value: "uploaded", label: "Uploaded" },
  { value: "selected", label: "Selected" },
  { value: "done", label: "Done" }
];

function OptionSelect({ id, label, value, options, onChange, className }: { id?: string; label: string; value: string; options: Option[]; onChange: (value: string) => void; className?: string }) {
  return <Select items={options} value={value || ALL} onValueChange={(next) => onChange(!next || next === ALL ? "" : String(next))}>
    <SelectTrigger id={id} aria-label={label} className={className}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

const personOptions = (people: PlanningPerson[], any: string): Option[] => [{ value: ALL, label: any }, ...people.map((person) => ({ value: String(person.id), label: person.name }))];

/** The refinements kept behind "More filters", as readable chips. */
function moreFilterChips(filters: PlanningFilters): Array<{ key: string; label: string; clear: Partial<PlanningFilters> }> {
  const chips: Array<{ key: string; label: string; clear: Partial<PlanningFilters> }> = [];
  if (filters.wordpressState) chips.push({ key: "wordpress", label: WORDPRESS_STATES.find((item) => item.value === filters.wordpressState)?.label || filters.wordpressState, clear: { wordpressState: "" } });
  if (filters.visualStatus) chips.push({ key: "visual", label: `${__("Visuals", "weekly-wildcat-headless")}: ${VISUAL_STATUSES.find((item) => item.value === filters.visualStatus)?.label || filters.visualStatus}`, clear: { visualStatus: "" } });
  if (filters.deadlineFrom || filters.deadlineTo) chips.push({ key: "deadline", label: `${__("Deadline", "weekly-wildcat-headless")} ${filters.deadlineFrom || "…"} – ${filters.deadlineTo || "…"}`, clear: { deadlineFrom: "", deadlineTo: "" } });
  if (filters.plannedFrom || filters.plannedTo) chips.push({ key: "planned", label: `${__("Planned", "weekly-wildcat-headless")} ${filters.plannedFrom || "…"} – ${filters.plannedTo || "…"}`, clear: { plannedFrom: "", plannedTo: "" } });
  if (filters.mine) chips.push({ key: "mine", label: __("Mine", "weekly-wildcat-headless"), clear: { mine: false } });
  if (filters.unassigned) chips.push({ key: "unassigned", label: __("Unassigned", "weekly-wildcat-headless"), clear: { unassigned: false } });
  if (filters.overdue) chips.push({ key: "overdue", label: __("Overdue", "weekly-wildcat-headless"), clear: { overdue: false } });
  if (filters.needsReview) chips.push({ key: "review", label: __("Needs review", "weekly-wildcat-headless"), clear: { needsReview: false } });
  return chips;
}

export const hasActiveFilters = (filters: PlanningFilters) => JSON.stringify(normalizePlanningFilters(filters)) !== JSON.stringify(EMPTY_PLANNING_FILTERS);

export type StoryFiltersProps = {
  filters: PlanningFilters;
  onChange: (next: PlanningFilters) => void;
  statuses: PlanningWorkflowStatus[];
  writers: PlanningPerson[];
  editors: PlanningPerson[];
  /** The saved views menu sits at the start of the toolbar. */
  savedViews?: ReactNode;
  /** The List hides finished published stories; this brings them back. Not a saved-view filter. */
  showPublished?: { value: boolean; onChange: (value: boolean) => void };
};

/**
 * One responsive toolbar. Saved view, search, Workflow, Writer, Editor and More
 * filters stay together on wide screens and wrap naturally when space runs out.
 * Extra refinements still become removable chips, so no filter is invisible.
 */
export function StoryFilters({ filters, onChange, statuses, writers, editors, savedViews, showPublished }: StoryFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const update = (patch: Partial<PlanningFilters>) => onChange(normalizePlanningFilters({ ...filters, ...patch }));
  const chips = [...moreFilterChips(filters), ...(showPublished?.value ? [{ key: "published", label: __("Showing published", "weekly-wildcat-headless"), clear: {} as Partial<PlanningFilters> }] : [])];
  const workflowOptions: Option[] = [{ value: ALL, label: __("All workflows", "weekly-wildcat-headless") }, ...statuses.filter((status) => status.group !== "derived").map((status) => ({ value: status.id, label: status.label }))];

  return <div className="flex flex-col gap-2" role="search" aria-label={__("Filter stories", "weekly-wildcat-headless")}>
    <div className="flex flex-wrap items-center gap-2 @4xl/planning:flex-nowrap">
      {savedViews}
      <InputGroup className="min-w-56 flex-[1_1_20rem] @4xl/planning:max-w-md">
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" aria-label={__("Search stories", "weekly-wildcat-headless")} placeholder={__("Search stories…", "weekly-wildcat-headless")} value={filters.query} onChange={(event) => update({ query: event.target.value })} />
      </InputGroup>
      <OptionSelect label={__("Workflow", "weekly-wildcat-headless")} value={filters.workflow} options={workflowOptions} onChange={(workflow) => update({ workflow })} className="w-40 shrink-0" />
      <OptionSelect label={__("Writer", "weekly-wildcat-headless")} value={filters.writerId === null ? "" : String(filters.writerId)} options={personOptions(writers, __("Any writer", "weekly-wildcat-headless"))} onChange={(value) => update({ writerId: value ? Number(value) : null })} className="w-36 shrink-0" />
      <OptionSelect label={__("Editor", "weekly-wildcat-headless")} value={filters.editorId === null ? "" : String(filters.editorId)} options={personOptions(editors, __("Any editor", "weekly-wildcat-headless"))} onChange={(value) => update({ editorId: value ? Number(value) : null })} className="w-36 shrink-0" />
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger render={<Button variant="outline" className="shrink-0" />}><SlidersHorizontal data-icon="inline-start" aria-hidden="true" />{__("More filters", "weekly-wildcat-headless")}{chips.length ? <Badge variant="secondary" className="ml-1">{chips.length}</Badge> : null}<ChevronDown data-icon="inline-end" aria-hidden="true" /></PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-4">
          <FieldGroup className="gap-3">
            <Field><FieldLabel htmlFor="story-filter-wordpress">{__("WordPress state", "weekly-wildcat-headless")}</FieldLabel><OptionSelect id="story-filter-wordpress" label={__("WordPress state", "weekly-wildcat-headless")} value={filters.wordpressState} options={WORDPRESS_STATES} onChange={(wordpressState) => update({ wordpressState })} className="w-full" /></Field>
            <Field><FieldLabel htmlFor="story-filter-visual">{__("Visual status", "weekly-wildcat-headless")}</FieldLabel><OptionSelect id="story-filter-visual" label={__("Visual status", "weekly-wildcat-headless")} value={filters.visualStatus} options={VISUAL_STATUSES} onChange={(visualStatus) => update({ visualStatus })} className="w-full" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field><FieldLabel htmlFor="story-filter-deadline-from">{__("Deadline from", "weekly-wildcat-headless")}</FieldLabel><Input id="story-filter-deadline-from" type="date" value={filters.deadlineFrom} onChange={(event) => update({ deadlineFrom: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor="story-filter-deadline-to">{__("Deadline to", "weekly-wildcat-headless")}</FieldLabel><Input id="story-filter-deadline-to" type="date" value={filters.deadlineTo} onChange={(event) => update({ deadlineTo: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor="story-filter-planned-from">{__("Planned from", "weekly-wildcat-headless")}</FieldLabel><Input id="story-filter-planned-from" type="date" value={filters.plannedFrom} onChange={(event) => update({ plannedFrom: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor="story-filter-planned-to">{__("Planned to", "weekly-wildcat-headless")}</FieldLabel><Input id="story-filter-planned-to" type="date" value={filters.plannedTo} onChange={(event) => update({ plannedTo: event.target.value })} /></Field>
            </div>
            {showPublished ? <Field orientation="horizontal"><Checkbox id="story-filter-published" checked={showPublished.value} onCheckedChange={(checked) => showPublished.onChange(Boolean(checked))} /><FieldLabel htmlFor="story-filter-published" className="font-normal">{__("Show finished published stories", "weekly-wildcat-headless")}</FieldLabel></Field> : null}
            {([["mine", __("Mine", "weekly-wildcat-headless")], ["unassigned", __("Unassigned", "weekly-wildcat-headless")], ["overdue", __("Overdue", "weekly-wildcat-headless")], ["needsReview", __("Needs review", "weekly-wildcat-headless")]] as const).map(([key, label]) => <Field key={key} orientation="horizontal"><Checkbox id={`story-filter-${key}`} checked={filters[key]} onCheckedChange={(checked) => update({ [key]: Boolean(checked) })} /><FieldLabel htmlFor={`story-filter-${key}`} className="font-normal">{label}</FieldLabel></Field>)}
          </FieldGroup>
        </PopoverContent>
      </Popover>
      {hasActiveFilters(filters) ? <Button variant="ghost" className="shrink-0" onClick={() => onChange({ ...EMPTY_PLANNING_FILTERS })}>{__("Clear", "weekly-wildcat-headless")}</Button> : null}
    </div>
    {chips.length ? <ul className="flex flex-wrap items-center gap-1.5" aria-label={__("Active filters", "weekly-wildcat-headless")}>
      {chips.map((chip) => <li key={chip.key}><Badge variant="secondary" className="gap-1 pr-0.5">{chip.label}<button type="button" className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`${__("Remove filter", "weekly-wildcat-headless")}: ${chip.label}`} onClick={() => (chip.key === "published" ? showPublished?.onChange(false) : update(chip.clear))}><X className="size-3" aria-hidden="true" /></button></Badge></li>)}
    </ul> : null}
  </div>;
}
