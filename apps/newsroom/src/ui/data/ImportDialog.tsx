"use client";

import type { FieldDefinition } from "@byline/data";
import { CSV_LIMITS, CsvError, guessColumnMapping, parseDelimited } from "@byline/data/csv";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { CheckCircle2, FileUp } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { ImportPreviewResult } from "../../data/server";

const SKIP = "__skip__";
const ROW_ID = "$id";

/**
 * CSV import: choose a file, map each column to a field (matched by name to
 * start), check the server's preview, then import. The server parses and
 * types every cell again and refuses the whole file if any cell is not
 * clearly a value of its field. A column mapped to Row ID updates rows in
 * place instead of adding them.
 */
export function ImportDialog({ open, onOpenChange, fields, onPreview, onCommit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldDefinition[];
  onPreview: (text: string, mapping: Array<string | null>) => Promise<ImportPreviewResult>;
  onCommit: (text: string, mapping: Array<string | null>) => Promise<void>;
}) {
  const id = useId();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = useState<Array<string | null>>([]);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const header = useMemo(() => {
    if (!file) return [] as string[];
    try {
      return parseDelimited(file.text)[0] ?? [];
    } catch {
      return [];
    }
  }, [file]);

  const reset = () => {
    setFile(null);
    setMapping([]);
    setPreview(null);
    setError(null);
  };

  const choose = async (input: File | undefined) => {
    reset();
    if (!input) return;
    if (input.size > CSV_LIMITS.bytes) return setError("That file is larger than 5 MB.");
    const text = await input.text();
    try {
      const [first = []] = parseDelimited(text);
      if (!first.length) return setError("That file has no header row.");
      setFile({ name: input.name, text });
      setMapping(guessColumnMapping(first, fields).map((key, index) => key ?? (/^(row )?id$/i.test(first[index]?.trim() ?? "") ? ROW_ID : null)));
    } catch (problem) {
      setError(problem instanceof CsvError ? problem.message : "Byline couldn't read that file.");
    }
  };

  const run = async (kind: "preview" | "commit") => {
    if (!file) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "preview") setPreview(await onPreview(file.text, mapping));
      else {
        await onCommit(file.text, mapping);
        reset();
        onOpenChange(false);
      }
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const used = new Set(mapping.filter(Boolean));
  const fieldItems = [{ value: SKIP, label: "Skip this column" }, { value: ROW_ID, label: "Row ID (update existing rows)" }, ...fields.map((field) => ({ value: field.key, label: field.label }))];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { if (!next) reset(); onOpenChange(next); } }}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>Add rows from a spreadsheet export. Nothing is imported until you've seen the preview.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4">
          <Field data-invalid={error && !file ? true : undefined}>
            <FieldLabel htmlFor={`${id}-file`}>File</FieldLabel>
            <Input id={`${id}-file`} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void choose(event.target.files?.[0])} />
            <FieldDescription>CSV or tab-separated, with a header row. Up to {CSV_LIMITS.rows.toLocaleString("en-US")} rows and 5 MB.</FieldDescription>
          </Field>
          {file && header.length ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Columns</p>
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>In the file</TableHead>
                      <TableHead>Goes into</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {header.map((column, index) => (
                      <TableRow key={`${column}-${index}`}>
                        <TableCell className="max-w-48 truncate font-medium">{column || `Column ${index + 1}`}</TableCell>
                        <TableCell className="py-1.5">
                          <Select items={fieldItems} value={mapping[index] ?? SKIP} onValueChange={(next) => {
                            setPreview(null);
                            setMapping((current) => current.map((entry, at) => (at === index ? (next === SKIP ? null : String(next)) : entry)));
                          }}>
                            <SelectTrigger size="sm" className="w-full" aria-label={`Field for ${column || `column ${index + 1}`}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SKIP}>Skip this column</SelectItem>
                              <SelectItem value={ROW_ID} disabled={used.has(ROW_ID) && mapping[index] !== ROW_ID}>Row ID (update existing rows)</SelectItem>
                              <SelectSeparator />
                              <SelectGroup>
                                <SelectLabel>Fields</SelectLabel>
                                {fields.map((field) => <SelectItem key={field.key} value={field.key} disabled={used.has(field.key) && mapping[index] !== field.key}>{field.label}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {preview ? (
            preview.issues.length ? (
              <Alert variant="destructive">
                <AlertTitle>{preview.issues.length} {preview.issues.length === 1 ? "cell needs" : "cells need"} fixing before import</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 grid max-h-40 gap-0.5 overflow-y-auto">
                    {preview.issues.slice(0, 50).map((issue, index) => <li key={index}><span className="font-medium">Row {issue.row}, {issue.column}:</span> {issue.message}</li>)}
                  </ul>
                  {preview.issues.length > 50 ? <p className="mt-1">And {preview.issues.length - 50} more. Fix the file and choose it again.</p> : null}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Ready to import {preview.rows.toLocaleString("en-US")} {preview.rows === 1 ? "row" : "rows"}</AlertTitle>
                <AlertDescription>{[preview.creates ? `${preview.creates} new` : "", preview.updates ? `${preview.updates} updated by row ID` : "", preview.ignored.length ? `skipping ${preview.ignored.join(", ")}` : ""].filter(Boolean).join(" · ")}</AlertDescription>
              </Alert>
            )
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(busy)}>Cancel</Button>
          {preview && !preview.issues.length ? (
            <Button type="button" onClick={() => void run("commit")} disabled={Boolean(busy)}>{busy === "commit" ? <Spinner data-icon="inline-start" /> : null}Import {preview.rows.toLocaleString("en-US")} {preview.rows === 1 ? "row" : "rows"}</Button>
          ) : (
            <Button type="button" onClick={() => void run("preview")} disabled={!file || !mapping.some(Boolean) || Boolean(busy)}>{busy === "preview" ? <Spinner data-icon="inline-start" /> : <FileUp data-icon="inline-start" />}Check file</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
