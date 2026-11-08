import { useState } from "react";
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
import { scopeOffersFilter, type StoryFilterControl, type StoryScope } from "./stories-scope";

type Option = { value: string; label: string };
const ALL = "__all";

/** Only Draft and Scheduled can still be a refinement: Published is a scope, so a filter for it would say the same thing twice. */
const PUBLICATION_STATE_LABELS: Record<string, string> = { draft: "Draft", scheduled: "Scheduled" };
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

type Chip = { key: string; label: string; clear: Partial<PlanningFilters> };

type ChipContext = { scope: StoryScope; statuses: PlanningWorkflowStatus[]; writers: PlanningPerson[]; editors: PlanningPerson[] };

/**
 * Every refinement that is on and not plainly visible, as a readable chip. The
 * "More filters" refinements always get one; Workflow, Writer and Editor get one
 * only when the current scope hides their select, so a filter carried over from
 * another scope never narrows the list unseen.
 */
export function activeFilterChips(filters: PlanningFilters, { scope, statuses, writers, editors }: ChipContext): Chip[] {
  const chips: Chip[] = [];
  const hidden = (control: StoryFilterControl) => !scopeOffersFilter(scope, control);
  if (filters.workflow && hidden("workflow")) chips.push({ key: "workflow", label: `Workflow: ${statuses.find((status) => status.id === filters.workflow)?.label || filters.workflow}`, clear: { workflow: "" } });
  if (filters.writerId !== null && hidden("writer")) chips.push({ key: "writer", label: `Writer: ${writers.find((person) => person.id === filters.writerId)?.name || "Selected"}`, clear: { writerId: null } });
  if (filters.editorId !== null && hidden("editor")) chips.push({ key: "editor", label: `Editor: ${editors.find((person) => person.id === filters.editorId)?.name || "Selected"}`, clear: { editorId: null } });
  if (filters.publicationState) chips.push({ key: "publication", label: PUBLICATION_STATE_LABELS[filters.publicationState] || filters.publicationState, clear: { publicationState: "" } });
  if (filters.visualStatus) chips.push({ key: "visual", label: `Visuals: ${VISUAL_STATUSES.find((item) => item.value === filters.visualStatus)?.label || filters.visualStatus}`, clear: { visualStatus: "" } });
  if (filters.deadlineFrom || filters.deadlineTo) chips.push({ key: "deadline", label: `Deadline ${filters.deadlineFrom || "…"} – ${filters.deadlineTo || "…"}`, clear: { deadlineFrom: "", deadlineTo: "" } });
  if (filters.plannedFrom || filters.plannedTo) chips.push({ key: "planned", label: `Planned ${filters.plannedFrom || "…"} – ${filters.plannedTo || "…"}`, clear: { plannedFrom: "", plannedTo: "" } });
  if (filters.publishedFrom || filters.publishedTo) chips.push({ key: "published", label: `Published ${filters.publishedFrom || "…"} – ${filters.publishedTo || "…"}`, clear: { publishedFrom: "", publishedTo: "" } });
  if (filters.mine) chips.push({ key: "mine", label: "Mine", clear: { mine: false } });
  if (filters.unassigned) chips.push({ key: "unassigned", label: "Unassigned", clear: { unassigned: false } });
  if (filters.overdue) chips.push({ key: "overdue", label: "Overdue", clear: { overdue: false } });
  if (filters.needsReview) chips.push({ key: "review", label: "Needs review", clear: { needsReview: false } });
  return chips;
}

export const hasActiveFilters = (filters: PlanningFilters) => JSON.stringify(normalizePlanningFilters(filters)) !== JSON.stringify(EMPTY_PLANNING_FILTERS);

export type StoryFiltersProps = {
  /** The scope decides which controls are offered; a filter it does not offer stays visible as a chip. */
  scope: StoryScope;
  filters: PlanningFilters;
  onChange: (next: PlanningFilters) => void;
  statuses: PlanningWorkflowStatus[];
  writers: PlanningPerson[];
  editors: PlanningPerson[];
};

const FLAG_CONTROLS = [["mine", "Mine"], ["unassigned", "Unassigned"], ["overdue", "Overdue"], ["needsReview", "Needs review"]] as const;

/**
 * One responsive toolbar. Search, then the people and stage selects the scope
 * offers, then More filters; they wrap naturally when space runs out. Extra
 * refinements become removable chips, so no filter is invisible.
 */
export function StoryFilters({ scope, filters, onChange, statuses, writers, editors }: StoryFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const update = (patch: Partial<PlanningFilters>) => onChange(normalizePlanningFilters({ ...filters, ...patch }));
  const offers = (control: StoryFilterControl) => scopeOffersFilter(scope, control);
  const chips = activeFilterChips(filters, { scope, statuses, writers, editors });
  const moreChips = chips.filter((chip) => !["workflow", "writer", "editor"].includes(chip.key));
  const workflowOptions: Option[] = [{ value: ALL, label: "All workflows" }, ...statuses.filter((status) => status.group !== "derived").map((status) => ({ value: status.id, label: status.label }))];

  return <div className="flex flex-col gap-2" role="search" aria-label={"Filter stories"}>
    <div className="flex flex-wrap items-center gap-1.5 @4xl/planning:flex-nowrap">
      <InputGroup className="min-w-48 flex-[1_1_12rem]">
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" aria-label={"Search stories"} placeholder={"Search stories…"} value={filters.query} onChange={(event) => update({ query: event.target.value })} />
      </InputGroup>
      {offers("workflow") ? <OptionSelect label={"Workflow"} value={filters.workflow} options={workflowOptions} onChange={(workflow) => update({ workflow })} className="h-8 w-32 shrink-0" /> : null}
      {offers("writer") ? <OptionSelect label={"Writer"} value={filters.writerId === null ? "" : String(filters.writerId)} options={personOptions(writers, "Any writer")} onChange={(value) => update({ writerId: value ? Number(value) : null })} className="h-8 w-32 shrink-0" /> : null}
      {offers("editor") ? <OptionSelect label={"Editor"} value={filters.editorId === null ? "" : String(filters.editorId)} options={personOptions(editors, "Any editor")} onChange={(value) => update({ editorId: value ? Number(value) : null })} className="h-8 w-32 shrink-0" /> : null}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger render={<Button variant="outline" className="shrink-0" />}><SlidersHorizontal data-icon="inline-start" aria-hidden="true" />More filters{moreChips.length ? <Badge variant="secondary" className="ml-1">{moreChips.length}</Badge> : null}<ChevronDown data-icon="inline-end" aria-hidden="true" /></PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-4">
          <FieldGroup className="gap-3">
            {offers("visual") ? <Field><FieldLabel htmlFor="story-filter-visual">Visual status</FieldLabel><OptionSelect id="story-filter-visual" label={"Visual status"} value={filters.visualStatus} options={VISUAL_STATUSES} onChange={(visualStatus) => update({ visualStatus })} className="w-full" /></Field> : null}
            <div className="grid grid-cols-2 gap-2">
              {offers("deadline") ? <>
                <Field><FieldLabel htmlFor="story-filter-deadline-from">Deadline from</FieldLabel><Input id="story-filter-deadline-from" type="date" value={filters.deadlineFrom} onChange={(event) => update({ deadlineFrom: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor="story-filter-deadline-to">Deadline to</FieldLabel><Input id="story-filter-deadline-to" type="date" value={filters.deadlineTo} onChange={(event) => update({ deadlineTo: event.target.value })} /></Field>
              </> : null}
              {offers("planned") ? <>
                <Field><FieldLabel htmlFor="story-filter-planned-from">Planned from</FieldLabel><Input id="story-filter-planned-from" type="date" value={filters.plannedFrom} onChange={(event) => update({ plannedFrom: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor="story-filter-planned-to">Planned to</FieldLabel><Input id="story-filter-planned-to" type="date" value={filters.plannedTo} onChange={(event) => update({ plannedTo: event.target.value })} /></Field>
              </> : null}
              {offers("published") ? <>
                <Field><FieldLabel htmlFor="story-filter-published-from">Published from</FieldLabel><Input id="story-filter-published-from" type="date" value={filters.publishedFrom} onChange={(event) => update({ publishedFrom: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor="story-filter-published-to">Published to</FieldLabel><Input id="story-filter-published-to" type="date" value={filters.publishedTo} onChange={(event) => update({ publishedTo: event.target.value })} /></Field>
              </> : null}
            </div>
            {FLAG_CONTROLS.filter(([key]) => offers(key)).map(([key, label]) => <Field key={key} orientation="horizontal"><Checkbox id={`story-filter-${key}`} checked={filters[key]} onCheckedChange={(checked) => update({ [key]: Boolean(checked) })} /><FieldLabel htmlFor={`story-filter-${key}`} className="font-normal">{label}</FieldLabel></Field>)}
          </FieldGroup>
        </PopoverContent>
      </Popover>
      {hasActiveFilters(filters) ? <Button variant="ghost" className="shrink-0" onClick={() => onChange({ ...EMPTY_PLANNING_FILTERS })}>Clear</Button> : null}
    </div>
    {chips.length ? <ul className="flex flex-wrap items-center gap-1.5" aria-label={"Active filters"}>
      {chips.map((chip) => <li key={chip.key}><Badge variant="secondary" className="gap-1 pr-0.5">{chip.label}<button type="button" className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`Remove filter: ${chip.label}`} onClick={() => update(chip.clear)}><X className="size-3" aria-hidden="true" /></button></Badge></li>)}
    </ul> : null}
  </div>;
}
