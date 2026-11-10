import { useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { DateRangeButton } from "@byline/newsroom-ui/components/date-fields";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@byline/newsroom-ui/ui/drawer";
import { useAnyCoarsePointer } from "@byline/newsroom-ui/lib/hooks";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { EMPTY_PLANNING_FILTERS, normalizePlanningFilters, type PlanningFilters, type PlanningPerson, type PlanningWorkflowStatus } from "../planning/planning-model";

type Option = { value: string; label: string };
const ALL = "__all";

const PUBLICATION_STATES: Option[] = [
  { value: ALL, label: "Any publication state" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" }
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
  if (filters.publicationState) chips.push({ key: "publication", label: PUBLICATION_STATES.find((item) => item.value === filters.publicationState)?.label || filters.publicationState, clear: { publicationState: "" } });
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
  /** Board and List hide finished published stories; this brings them back. Not a saved-view filter. */
  showPublished?: { value: boolean; onChange: (value: boolean) => void };
  /** The newsroom's current day (`YYYY-MM-DD`): turns on quick ranges ("Today", "Next 7 days") in the date filters. */
  today?: string;
};

/**
 * One responsive toolbar. Search, Workflow, Writer, Editor and More
 * filters stay together on wide screens and wrap naturally when space runs out.
 * Extra refinements still become removable chips, so no filter is invisible.
 */
export function StoryFilters({ filters, onChange, statuses, writers, editors, showPublished, today }: StoryFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const touch = useAnyCoarsePointer();
  const update = (patch: Partial<PlanningFilters>) => onChange(normalizePlanningFilters({ ...filters, ...patch }));
  const chips = [...moreFilterChips(filters), ...(showPublished?.value ? [{ key: "published", label: "Showing published", clear: {} as Partial<PlanningFilters> }] : [])];
  const workflowOptions: Option[] = [{ value: ALL, label: "All workflows" }, ...statuses.filter((status) => status.group !== "derived").map((status) => ({ value: status.id, label: status.label }))];

  const moreTrigger = <Button type="button" variant="outline" className="shrink-0" />;
  const moreLabel = <><SlidersHorizontal data-icon="inline-start" aria-hidden="true" />More filters{chips.length ? <Badge variant="secondary" className="ml-1">{chips.length}</Badge> : null}<ChevronDown data-icon="inline-end" aria-hidden="true" /></>;

  return <div className="flex flex-col gap-2" role="search" aria-label={"Filter stories"}>
    <div className="flex flex-wrap items-center gap-1.5 @4xl/planning:flex-nowrap">
      <InputGroup className="min-w-48 flex-[1_1_12rem]">
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" aria-label={"Search stories"} placeholder={"Search stories…"} value={filters.query} onChange={(event) => update({ query: event.target.value })} />
      </InputGroup>
      <OptionSelect label={"Workflow"} value={filters.workflow} options={workflowOptions} onChange={(workflow) => update({ workflow })} className="h-8 w-32 shrink-0" />
      <OptionSelect label={"Writer"} value={filters.writerId === null ? "" : String(filters.writerId)} options={personOptions(writers, "Any writer")} onChange={(value) => update({ writerId: value ? Number(value) : null })} className="h-8 w-32 shrink-0" />
      <OptionSelect label={"Editor"} value={filters.editorId === null ? "" : String(filters.editorId)} options={personOptions(editors, "Any editor")} onChange={(value) => update({ editorId: value ? Number(value) : null })} className="h-8 w-32 shrink-0" />
      {touch ? <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerTrigger render={moreTrigger}>{moreLabel}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Filters</DrawerTitle></DrawerHeader>
          <div className="px-4"><MoreFilterFields filters={filters} update={update} showPublished={showPublished} today={today} /></div>
          <DrawerFooter><DrawerClose render={<Button type="button" variant="outline" />}>Done</DrawerClose></DrawerFooter>
        </DrawerContent>
      </Drawer> : <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger render={moreTrigger}>{moreLabel}</PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-4">
          <MoreFilterFields filters={filters} update={update} showPublished={showPublished} today={today} />
        </PopoverContent>
      </Popover>}
      {hasActiveFilters(filters) || showPublished?.value ? <Button type="button" variant="ghost" className="shrink-0" onClick={() => { onChange({ ...EMPTY_PLANNING_FILTERS }); showPublished?.onChange(false); }}>Clear</Button> : null}
    </div>
    {chips.length ? <ul className="flex flex-wrap items-center gap-1.5" aria-label={"Active filters"}>
      {chips.map((chip) => <li key={chip.key}><Badge variant="secondary" className="gap-1 pr-0.5">{chip.label}<button type="button" className="rounded-full p-0.5 hover:bg-foreground/10 any-pointer-coarse:relative any-pointer-coarse:after:absolute any-pointer-coarse:after:top-1/2 any-pointer-coarse:after:right-0 any-pointer-coarse:after:size-11 any-pointer-coarse:after:-translate-y-1/2" aria-label={`Remove filter: ${chip.label}`} onClick={() => (chip.key === "published" ? showPublished?.onChange(false) : update(chip.clear))}><X className="size-3" aria-hidden="true" /></button></Badge></li>)}
    </ul> : null}
  </div>;
}

function MoreFilterFields({ filters, update, showPublished, today }: Pick<StoryFiltersProps, "filters" | "showPublished" | "today"> & { update: (patch: Partial<PlanningFilters>) => void }) {
  return <FieldGroup className="gap-3 any-pointer-coarse:[&_[data-slot=field][data-orientation=horizontal]]:min-h-11">
    <Field><FieldLabel htmlFor="story-filter-publication">Publication</FieldLabel><OptionSelect id="story-filter-publication" label={"Publication"} value={filters.publicationState} options={PUBLICATION_STATES} onChange={(publicationState) => update({ publicationState })} className="w-full" /></Field>
    <Field><FieldLabel htmlFor="story-filter-visual">Visual status</FieldLabel><OptionSelect id="story-filter-visual" label={"Visual status"} value={filters.visualStatus} options={VISUAL_STATUSES} onChange={(visualStatus) => update({ visualStatus })} className="w-full" /></Field>
    <Field><FieldLabel htmlFor="story-filter-deadline">Deadline</FieldLabel><DateRangeButton id="story-filter-deadline" from={filters.deadlineFrom} to={filters.deadlineTo} today={today} presets={["today", "next7", "month"]} onChange={(deadlineFrom, deadlineTo) => update({ deadlineFrom, deadlineTo })} /></Field>
    <Field><FieldLabel htmlFor="story-filter-planned">Planned publication</FieldLabel><DateRangeButton id="story-filter-planned" from={filters.plannedFrom} to={filters.plannedTo} today={today} presets={["today", "next7", "month"]} onChange={(plannedFrom, plannedTo) => update({ plannedFrom, plannedTo })} /></Field>
    {showPublished ? <Field orientation="horizontal"><Checkbox id="story-filter-published" checked={showPublished.value} onCheckedChange={(checked) => showPublished.onChange(Boolean(checked))} /><FieldLabel htmlFor="story-filter-published" className="font-normal">Show finished published stories</FieldLabel></Field> : null}
    {([["mine", "Mine"], ["unassigned", "Unassigned"], ["overdue", "Overdue"], ["needsReview", "Needs review"]] as const).map(([key, label]) => <Field key={key} orientation="horizontal"><Checkbox id={`story-filter-${key}`} checked={filters[key]} onCheckedChange={(checked) => update({ [key]: Boolean(checked) })} /><FieldLabel htmlFor={`story-filter-${key}`} className="font-normal">{label}</FieldLabel></Field>)}
  </FieldGroup>;
}
