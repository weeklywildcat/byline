"use client";

import { cn } from "@byline/newsroom-ui/lib/utils";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@byline/newsroom-ui/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { useQuery } from "@tanstack/react-query";
import { getJson, query, type Paginated } from "./api";
import type { Id, NamedDoc } from "./types";

export type Option = { id: Id; label: string };

export const relationshipOptionsKey = (collection: string) => ["byline", "relationship-options", collection] as const;

/** Options for a relationship, read with the signed-in user's access. */
export function useOptions(api: string, collection: string, labelField: "name" | "title" | "label", where: Record<string, string> = {}) {
  return useQuery({
    queryKey: [...relationshipOptionsKey(collection), api, labelField, where],
    queryFn: async () => {
      const result = await getJson<Paginated<NamedDoc>>(api, `/${collection}${query({ pagination: "false", depth: 0, sort: labelField, ...where })}`);
      return result.docs.map((doc) => ({ id: doc.id, label: String(doc[labelField] ?? doc.id) }));
    }
  }).data ?? [];
}

const triggerClass = "-ml-2 h-auto min-h-7 max-w-full justify-start px-2 py-1 text-left font-normal whitespace-normal";
const same = (a: Option, b: Option) => String(a.id) === String(b.id);

export function MultiPicker({ label, placeholder, options, value, onChange, disabled }: { label: string; placeholder: string; options: Option[]; value: Id[]; onChange: (ids: Id[]) => void; disabled?: boolean }) {
  // Keep selected values that have no loaded option yet (e.g. while options load), in order.
  const selected = value.map((id) => options.find((option) => String(option.id) === String(id)) ?? { id, label: "…" });
  const names = selected.map((option) => option.label).join(", ");
  return (
    <Combobox multiple items={options} value={selected} onValueChange={(next: Option[]) => onChange(next.map((option) => option.id))} itemToStringLabel={(option: Option) => option.label} isItemEqualToValue={same} disabled={disabled}>
      <ComboboxTrigger render={<Button type="button" variant="ghost" className={triggerClass} aria-label={`${label}: ${names || "none"}`} disabled={disabled} />}>
        <span className={cn("truncate", !names && "text-muted-foreground")}>{names || placeholder}</span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} aria-label={`Search ${label.toLowerCase()}`} placeholder="Search…" />
        <ComboboxEmpty>Nothing found.</ComboboxEmpty>
        <ComboboxList>{(option: Option) => <ComboboxItem key={String(option.id)} value={option}>{option.label}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

const NONE = "__none__";

export function SinglePicker({ label, placeholder, options, value, onChange, disabled }: { label: string; placeholder: string; options: Option[]; value: Id | null; onChange: (id: Id | null) => void; disabled?: boolean }) {
  const items = [{ value: NONE, label: placeholder }, ...options.map((option) => ({ value: String(option.id), label: option.label }))];
  return (
    <Select items={items} value={value === null ? NONE : String(value)} disabled={disabled} onValueChange={(next) => {
      if (next === null || next === NONE) return onChange(null);
      const match = options.find((option) => String(option.id) === next);
      onChange(match ? match.id : null);
    }}>
      <SelectTrigger aria-label={label} className="-ml-2 h-7 w-fit max-w-full border-transparent bg-transparent px-2 hover:bg-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
