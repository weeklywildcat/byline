"use client";

import { FIELD_TYPE_LABELS, FIELD_TYPES, type FieldDefinition, type FieldType } from "@byline/data";
import { CsvError, inferFieldsFromTable, parseDelimited, previewImport, retypeField } from "@byline/data/csv";
import { ChoiceCards } from "@byline/newsroom-ui/components/choice-cards";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useNewsroomRoutes } from "../shell/account";
import { createDataset, dataKeys, importCsv } from "./api";

type Start = "paste" | "empty";

/**
 * A new dataset, the shortest way: name it and paste a table from any
 * spreadsheet. Fields are inferred from the header and the values (each
 * stays adjustable), and the rows are imported through the same validated
 * import as a CSV. Or start empty and add fields one by one.
 */
export function CreateDatasetDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: number) => void }) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState<Start>("paste");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<Record<string, FieldType>>({});

  const table = useMemo((): { fields: FieldDefinition[]; rows: number; problem: string | null; invalid: string | null } => {
    if (start !== "paste" || !pasted.trim()) return { fields: [], rows: 0, problem: null, invalid: null };
    try {
      const [header = [], ...rows] = parseDelimited(pasted);
      if (!rows.length) return { fields: [], rows: 0, problem: "Include the header row and at least one row of data.", invalid: null };
      // A reporter's type choice wins over the guess; a choice field takes its options from the column.
      const fields = inferFieldsFromTable(header, rows).map((field, column) => (types[field.key] && types[field.key] !== field.type ? retypeField(field, types[field.key], rows.map((row) => row[column] ?? "")) : field));
      // The same strict parse the import runs: a type that doesn't fit the column is caught before anything is created.
      const issues = previewImport(header, rows, fields.map((field) => field.key), fields).issues;
      const invalid = issues.length ? `${issues.length} ${issues.length === 1 ? "cell doesn't" : "cells don't"} fit ${issues.length === 1 ? "its" : "their"} type. Row ${issues[0].row}, ${issues[0].column}: ${issues[0].message}` : null;
      return { fields, rows: rows.length, problem: null, invalid };
    } catch (problem) {
      return { fields: [], rows: 0, problem: problem instanceof CsvError ? problem.message : "Byline couldn't read that table.", invalid: null };
    }
  }, [pasted, start, types]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPasted("");
    setStart("paste");
    setTypes({});
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!title.trim()) return setError("Name the dataset.");
    if (start === "paste" && (!table.fields.length || table.problem || table.invalid)) return setError(table.problem ?? table.invalid ?? "Paste a table with a header row, or start with an empty dataset.");
    setBusy(true);
    setError(null);
    try {
      const created = await createDataset(api, { title: title.trim(), description: description.trim(), schema: { fields: table.fields, retiredKeys: [] } });
      if (start === "paste") {
        const result = await importCsv(api, created.id, { text: pasted, mapping: table.fields.map((entry) => entry.key), commit: true }).catch((problem: Error) => problem);
        if (result instanceof Error) toast.error(`The dataset was created, but its rows weren't imported: ${result.message}`);
        else toast.success(`Created ${title.trim()} with ${table.rows} ${table.rows === 1 ? "row" : "rows"}.`);
      } else toast.success(`Created ${title.trim()}. Add its fields next.`);
      await queries.invalidateQueries({ queryKey: dataKeys.overview() });
      reset();
      onOpenChange(false);
      onCreated(created.id);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>New dataset</DialogTitle>
            <DialogDescription>The facts the newsroom keeps, row by row. Nothing in a dataset is public until you publish it.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={error && !title.trim() ? true : undefined}>
              <FieldLabel htmlFor="data-new-title">Name</FieldLabel>
              <Input id="data-new-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="2026 marching band results" autoFocus maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor="data-new-description">Description <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id="data-new-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What the rows are and where they come from" maxLength={2000} />
            </Field>
            <ChoiceCards<Start>
              label="Start with"
              value={start}
              onChange={setStart}
              className="grid gap-2 sm:grid-cols-2"
              options={[
                { value: "paste", title: "Paste from a spreadsheet", description: "Copy the cells, header row included." },
                { value: "empty", title: "An empty dataset", description: "Add fields, then rows." }
              ]}
            />
            {start === "paste" ? (
              <Field data-invalid={table.problem ? true : undefined}>
                <FieldLabel htmlFor="data-new-paste">Table</FieldLabel>
                <Textarea id="data-new-paste" value={pasted} onChange={(event) => setPasted(event.target.value)} rows={5} className="max-h-40 font-mono text-xs" placeholder={"Band\tScore\tDivision\nNorth\t92.5\tA"} spellCheck={false} />
                {table.problem || table.invalid ? <FieldError>{table.problem ?? table.invalid}</FieldError> : (
                  <FieldDescription>{table.fields.length ? `${table.fields.length} fields and ${table.rows} ${table.rows === 1 ? "row" : "rows"}. Check each column's type before creating it.` : "Tab- or comma-separated. Up to 10,000 rows."}</FieldDescription>
                )}
                {table.fields.length ? (
                  <ul className="mt-1 grid max-h-44 gap-1 overflow-y-auto rounded-lg border p-1.5 sm:grid-cols-2" aria-label="Fields found">
                    {table.fields.map((entry) => (
                      <li key={entry.key} className="flex min-w-0 items-center justify-between gap-2 rounded-md px-1.5 py-0.5">
                        <span className="truncate text-sm">{entry.label}</span>
                        <Select items={FIELD_TYPES.filter((type) => type !== "relationship").map((type) => ({ value: type, label: FIELD_TYPE_LABELS[type].label }))} value={entry.type} onValueChange={(next) => setTypes((current) => ({ ...current, [entry.key]: next as FieldType }))}>
                          <SelectTrigger size="sm" className="w-32 shrink-0" aria-label={`Type of ${entry.label}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{FIELD_TYPES.filter((type) => type !== "relationship").map((type) => <SelectItem key={type} value={type}>{FIELD_TYPE_LABELS[type].label}</SelectItem>)}</SelectContent>
                        </Select>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Field>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}Create dataset</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
