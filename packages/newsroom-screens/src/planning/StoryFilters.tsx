import { useState, type ReactNode } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { EMPTY_PLANNING_FILTERS, normalizePlanningFilters, type PlanningFilters, type PlanningPerson, type PlanningWorkflowStatus } from "../planning/planning-model";

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
  if (filters.publicationState) chips.push({ key: "wordpress", label: WORDPRESS_STATES.find((item) => item.value === filters.publicationState)?.label || filters.publicationState, clear: { publicationState: "" } });
  if (filters.visualStatus) chips.push({ key: "visual", label: `Visuals: ${VISUAL_STATUSES.find((item) => item.value === filters.visualStatus)?.label || filters.visualStatus}`, clear: { visualStatus: "" } });
  if (filters.deadlineFrom || filters.deadlineTo) chips.push({ key: "deadline", label: `Deadline ${filters.deadlineFrom || "…"} – ${filters.deadlineTo || "…"}`, clear: { deadlineFrom: "", deadlineTo: "" } });
  if (filters.plannedFrom || filters.plannedTo) chips.push({ key: "planned", label: `Planned ${filters.plannedFrom || "…"} – ${filters.plannedTo || "…"}`, clear: { plannedFrom: "", plannedTo: "" } });
  if (filters.mine) chips.push({ key: "mine", label: "Mine", clear: { mine: false } });
  if (filters.unassigned) chips.push({ key: "unassigned", label: "Unassigned", clear: { unassigned: false } });
  if (filters.overdue) chips.push({ key: "overdue", label: "Overdue", clear: { overdue: false } });
  if (filters.needsReview) chips.push({ key: "review", label: "Needs review", clear: { needsReview: false } });
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
  const chips = [...moreFilterChips(filters), ...(showPublished?.value ? [{ key: "published", label: "Showing published", clear: {} as Partial<PlanningFilters> }] : [])];
  const workflowOptions: Option[] = [{ value: ALL, label: "All workflows" }, ...statuses.filter((status) => status.group !== "derived").map((status) => ({ value: status.id, label: status.label }))];

  return <div className="flex flex-col gap-2" role="search" aria-label={"Filter stories"}>
    <div className="flex flex-wrap items-center gap-1.5 @4xl/planning:flex-nowrap">
      {savedViews}
      <InputGroup className="min-w-48 flex-[1_1_12rem]">
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" aria-label={"Search stories"} placeholder={"Search stories…"} value={filters.query} onChange={(event) => update({ query: event.target.value })} />
      </InputGroup>
      <OptionSelect label={"Workflow"} value={filters.workflow} options={workflowOptions} onChange={(workflow) => update({ workflow })} className="h-8 w-32 shrink-0" />
      <OptionSelect label={"Writer"} value={filters.writerId === null ? "" : String(filters.writerId)} options={personOptions(writers, "Any writer")} onChange={(value) => update({ writerId: value ? Number(value) : null })} className="h-8 w-32 shrink-0" />
      <OptionSelect label={"Editor"} value={filters.editorId === null ? "" : String(filters.editorId)} options={personOptions(editors, "Any editor")} onChange={(value) => update({ editorId: value ? Number(value) : null })} className="h-8 w-32 shrink-0" />
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger render={<Button variant="outline" className="shrink-0" />}><SlidersHorizontal data-icon="inline-start" aria-hidden="true" />More filters{chips.length ? <Badge variant="secondary" className="ml-1">{chips.length}</Badge> : null}<ChevronDown data-icon="inline-end" aria-hidden="true" /></PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-4">
          <FieldGroup className="gap-3">
            <Field><FieldLabel htmlFor="story-filter-wordpress">WordPress state</FieldLabel><OptionSelect id="story-filter-wordpress" label={"WordPress state"} value={filters.publicationState} options={WORDPRESS_STATES} onChange={(publicationState) => update({ publicationState })} className="w-full" /></Field>
            <Field><FieldLabel htmlFor="story-filter-visual">Visual status</FieldLabel><OptionSelect id="story-filter-visual" label={"Visual status"} value={filters.visualStatus} options={VISUAL_STATUSES} onChange={(visualStatus) => update({ visualStatus })} className="w-full" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field><FieldLabel htmlFor="story-filter-deadline-from">Deadline from</FieldLabel><Input id="story-filter-deadline-from" type="date" value={filters.deadlineFrom} onChange={(event) => update({ deadlineFrom: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor="story-filter-deadline-to">Deadline to</FieldLabel><Input id="story-filter-deadline-to" type="date" value={filters.deadlineTo} onChange={(event) => update({ deadlineTo: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor="story-filter-planned-from">Planned from</FieldLabel><Input id="story-filter-planned-from" type="date" value={filters.plannedFrom} onChange={(event) => update({ plannedFrom: event.target.value })} /></Field>
              <Field><FieldLabel htmlFor="story-filter-planned-to">Planned to</FieldLabel><Input id="story-filter-planned-to" type="date" value={filters.plannedTo} onChange={(event) => update({ plannedTo: event.target.value })} /></Field>
            </div>
            {showPublished ? <Field orientation="horizontal"><Checkbox id="story-filter-published" checked={showPublished.value} onCheckedChange={(checked) => showPublished.onChange(Boolean(checked))} /><FieldLabel htmlFor="story-filter-published" className="font-normal">Show finished published stories</FieldLabel></Field> : null}
            {([["mine", "Mine"], ["unassigned", "Unassigned"], ["overdue", "Overdue"], ["needsReview", "Needs review"]] as const).map(([key, label]) => <Field key={key} orientation="horizontal"><Checkbox id={`story-filter-${key}`} checked={filters[key]} onCheckedChange={(checked) => update({ [key]: Boolean(checked) })} /><FieldLabel htmlFor={`story-filter-${key}`} className="font-normal">{label}</FieldLabel></Field>)}
          </FieldGroup>
        </PopoverContent>
      </Popover>
      {hasActiveFilters(filters) ? <Button variant="ghost" className="shrink-0" onClick={() => onChange({ ...EMPTY_PLANNING_FILTERS })}>Clear</Button> : null}
    </div>
    {chips.length ? <ul className="flex flex-wrap items-center gap-1.5" aria-label={"Active filters"}>
      {chips.map((chip) => <li key={chip.key}><Badge variant="secondary" className="gap-1 pr-0.5">{chip.label}<button type="button" className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`Remove filter: ${chip.label}`} onClick={() => (chip.key === "published" ? showPublished?.onChange(false) : update(chip.clear))}><X className="size-3" aria-hidden="true" /></button></Badge></li>)}
    </ul> : null}
  </div>;
}
