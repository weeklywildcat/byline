"use client";

import type { DataPresentationDescriptor } from "@byline/data";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { RadioGroup, RadioGroupItem } from "@byline/newsroom-ui/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { Code2, LayoutTemplate } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import type { DataOverview } from "../../data/server";
import { useNewsroomRoutes } from "../shell/account";
import { createProject, dataKeys } from "./api";

const NONE = "__none__";

/** What a presentation reads, in a reporter's words: "Entries: Name, Score". */
export function presentationNeeds(descriptor: DataPresentationDescriptor): string {
  return descriptor.slots.map((slot) => `${slot.label}: ${Object.values(slot.fields).filter((role) => role.required).map((role) => role.label).join(", ") || "any fields"}`).join(" · ");
}

/**
 * A new project: a name, how readers will see it (a template anyone can use,
 * or a presentation a developer built), and the dataset to start from. The
 * fields are matched by name and type; the project screen shows every
 * binding to adjust before publishing.
 */
export function CreateProjectDialog({ open, onOpenChange, overview, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; overview: DataOverview; onCreated: (id: number) => void }) {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const id = useId();
  const templates = overview.presentations.filter((entry) => entry.kind === "template");
  const custom = overview.presentations.filter((entry) => entry.kind === "custom");
  const [title, setTitle] = useState("");
  const [presentation, setPresentation] = useState(templates[0]?.key ?? custom[0]?.key ?? "");
  const [dataset, setDataset] = useState(overview.datasets[0]?.key ?? NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!title.trim()) return setError("Name the project.");
    setBusy(true);
    setError(null);
    try {
      const created = await createProject(api, { title: title.trim(), presentation, ...(dataset !== NONE ? { dataset } : {}) });
      await queries.invalidateQueries({ queryKey: dataKeys.overview() });
      setTitle("");
      onOpenChange(false);
      onCreated(created.id);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const option = (entry: DataPresentationDescriptor) => (
    <label key={entry.key} htmlFor={`${id}-${entry.key}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/5">
      <RadioGroupItem id={`${id}-${entry.key}`} value={entry.key} className="mt-0.5" aria-describedby={`${id}-${entry.key}-help`} />
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-medium">{entry.name}</span>
        <span id={`${id}-${entry.key}-help`} className="text-xs text-muted-foreground">{entry.description}</span>
        <span className="text-xs text-muted-foreground"><span className="font-medium text-foreground/80">Needs</span> {presentationNeeds(entry)}</span>
      </span>
    </label>
  );

  const selectedDataset = overview.datasets.find((entry) => entry.key === dataset);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>What readers see. It shows published data only, so editing a dataset never changes a public page by accident.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-title`}>Name</FieldLabel>
              <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Marching band rankings" autoFocus maxLength={200} />
              <FieldDescription>Readers see this as the page's headline. You can change it later.</FieldDescription>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Presentation</FieldLegend>
              <RadioGroup value={presentation} onValueChange={(next) => setPresentation(String(next))} className="grid max-h-[min(22rem,45vh)] gap-3 overflow-y-auto pr-1">
                {templates.length ? (
                  <div className="grid gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"><LayoutTemplate className="size-3.5" />Templates</p>
                    {templates.map(option)}
                  </div>
                ) : null}
                {custom.length ? (
                  <div className="grid gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"><Code2 className="size-3.5" />Custom</p>
                    {custom.map(option)}
                  </div>
                ) : null}
              </RadioGroup>
            </FieldSet>
            <Field>
              <FieldLabel htmlFor={`${id}-dataset`}>Start from</FieldLabel>
              <Select items={[{ value: NONE, label: "Choose later" }, ...overview.datasets.map((entry) => ({ value: entry.key, label: entry.title }))]} value={dataset} onValueChange={(next) => setDataset(String(next ?? NONE))}>
                <SelectTrigger id={`${id}-dataset`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose later</SelectItem>
                  {overview.datasets.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedDataset && selectedDataset.publication === "unpublished" ? <FieldDescription>This dataset isn't published yet. You can set the project up now and publish the data before the project.</FieldDescription> : null}
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !presentation}>{busy ? <Spinner data-icon="inline-start" /> : null}Create project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
