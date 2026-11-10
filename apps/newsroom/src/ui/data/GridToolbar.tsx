"use client";

import { OPERATORS_BY_TYPE, QUERY_OPERATORS, type FieldDefinition, type QueryFilter, type QueryOperator } from "@byline/data";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { Columns3, ListFilter, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The grid's toolbar: search, filters built only from the closed Data query
 * operators each field type allows, and column visibility. A filter that is
 * still missing its value is shown but not applied.
 */
export type GridView = { search: string; filters: QueryFilter[]; match: "all" | "any"; hidden: string[] };

export function GridToolbar({ fields, view, onChange, summary }: { fields: FieldDefinition[]; view: GridView; onChange: (view: GridView) => void; summary: React.ReactNode }) {
  const [search, setSearch] = useState(view.search);
  useEffect(() => setSearch(view.search), [view.search]);
  useEffect(() => {
    if (search === view.search) return;
    const timer = window.setTimeout(() => onChange({ ...view, search }), 200);
    return () => window.clearTimeout(timer);
  }, [search, view, onChange]);
  const active = view.filters.filter(isComplete).length;
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Rows">
      <InputGroup className="w-full sm:w-64">
        <InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rows" aria-label="Search rows" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
        {search ? <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setSearch("")}><X /></InputGroupButton></InputGroupAddon> : null}
      </InputGroup>
      <FilterPopover fields={fields} view={view} onChange={onChange} count={active} />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
          <Columns3 data-icon="inline-start" />Columns{view.hidden.length ? <Badge variant="secondary" className="ml-1 tabular-nums">{fields.length - view.hidden.length}/{fields.length}</Badge> : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {fields.map((field) => (
              <DropdownMenuCheckboxItem key={field.key} checked={!view.hidden.includes(field.key)} closeOnClick={false}
                onCheckedChange={(checked) => onChange({ ...view, hidden: checked ? view.hidden.filter((key) => key !== field.key) : [...view.hidden, field.key] })}>
                {field.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
          {view.hidden.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onChange({ ...view, hidden: [] })}>Show all</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto text-sm text-muted-foreground" role="status">{summary}</div>
    </div>
  );
}

export function isComplete(filter: QueryFilter): boolean {
  if (!QUERY_OPERATORS[filter.op].value) return true;
  if (Array.isArray(filter.value)) return filter.value.length > 0;
  return filter.value !== undefined && filter.value !== null && filter.value !== "";
}

const NUMERIC = new Set(["integer", "number", "percentage"]);

function FilterPopover({ fields, view, onChange, count }: { fields: FieldDefinition[]; view: GridView; onChange: (view: GridView) => void; count: number }) {
  const filterable = fields;
  const update = (index: number, next: QueryFilter | null) => onChange({ ...view, filters: next ? view.filters.map((entry, at) => (at === index ? next : entry)) : view.filters.filter((_, at) => at !== index) });
  const add = () => {
    const field = filterable[0];
    if (field) onChange({ ...view, filters: [...view.filters, { field: field.key, op: OPERATORS_BY_TYPE[field.type][0] }] });
  };
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <ListFilter data-icon="inline-start" />Filter{count ? <Badge variant="secondary" className="ml-1 tabular-nums">{count}</Badge> : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] gap-3">
        {view.filters.length > 1 ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Show rows that match</span>
            <ToggleGroup variant="outline" size="sm" spacing={0} value={[view.match]} onValueChange={(next: unknown[]) => { if (next[0] === "all" || next[0] === "any") onChange({ ...view, match: next[0] }); }} aria-label="Match">
              <ToggleGroupItem value="all">all</ToggleGroupItem>
              <ToggleGroupItem value="any">any</ToggleGroupItem>
            </ToggleGroup>
            <span className="text-muted-foreground">filters</span>
          </div>
        ) : null}
        {view.filters.length ? (
          <ul className="grid gap-2">
            {view.filters.map((filter, index) => <FilterRule key={index} filter={filter} fields={filterable} onChange={(next) => update(index, next)} />)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No filters. Every row is shown.</p>}
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={add} disabled={!filterable.length}><Plus data-icon="inline-start" />Add filter</Button>
          {view.filters.length ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...view, filters: [] })}>Clear all</Button> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterRule({ filter, fields, onChange }: { filter: QueryFilter; fields: FieldDefinition[]; onChange: (next: QueryFilter | null) => void }) {
  const field = fields.find((entry) => entry.key === filter.field) ?? fields[0];
  if (!field) return null;
  const operators = OPERATORS_BY_TYPE[field.type];
  const needsValue = QUERY_OPERATORS[filter.op].value;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2">
      <Select items={fields.map((entry) => ({ value: entry.key, label: entry.label }))} value={field.key} onValueChange={(next) => {
        const target = fields.find((entry) => entry.key === next);
        if (target) onChange({ field: target.key, op: OPERATORS_BY_TYPE[target.type][0] });
      }}>
        <SelectTrigger size="sm" aria-label="Field" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{fields.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select items={operators.map((op) => ({ value: op, label: QUERY_OPERATORS[op].label }))} value={filter.op} onValueChange={(next) => onChange({ field: field.key, op: next as QueryOperator, ...(QUERY_OPERATORS[next as QueryOperator].value && !(next === "anyOf") ? { value: Array.isArray(filter.value) ? undefined : filter.value } : {}) })}>
        <SelectTrigger size="sm" aria-label="Condition" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{operators.map((op) => <SelectItem key={op} value={op}>{QUERY_OPERATORS[op].label}</SelectItem>)}</SelectContent>
      </Select>
      {!needsValue ? <span /> : field.type === "select" ? (
        filter.op === "anyOf" ? (
          <div className="flex max-h-28 flex-wrap gap-x-3 gap-y-1 overflow-y-auto text-sm">
            {field.options.choices.map((choice) => {
              const values = Array.isArray(filter.value) ? filter.value : [];
              return (
                <label key={choice.value} className="inline-flex items-center gap-1.5">
                  <Checkbox checked={values.includes(choice.value)} onCheckedChange={(checked) => onChange({ ...filter, value: checked ? [...values, choice.value] : values.filter((value) => value !== choice.value) })} />
                  {choice.label}
                </label>
              );
            })}
          </div>
        ) : (
          <Select items={field.options.choices.map((choice) => ({ value: choice.value, label: choice.label }))} value={typeof filter.value === "string" ? filter.value : null} onValueChange={(next) => onChange({ ...filter, value: String(next) })}>
            <SelectTrigger size="sm" aria-label="Value" className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{field.options.choices.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent>
          </Select>
        )
      ) : (
        <Input
          className="h-7"
          aria-label="Value"
          type={field.type === "date" || field.type === "dateTime" ? "date" : NUMERIC.has(field.type) ? "number" : "text"}
          value={filter.value === undefined || filter.value === null || Array.isArray(filter.value) ? "" : String(filter.value)}
          onChange={(event) => {
            const raw = event.target.value;
            const value = !raw ? undefined : NUMERIC.has(field.type) ? (Number.isFinite(Number(raw)) ? Number(raw) : undefined) : field.type === "dateTime" ? `${raw}T00:00:00.000Z` : raw;
            onChange({ ...filter, value });
          }}
        />
      )}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove filter" onClick={() => onChange(null)}><X /></Button>
    </li>
  );
}
