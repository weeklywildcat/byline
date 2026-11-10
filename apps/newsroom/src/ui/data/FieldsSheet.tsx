"use client";

import {
  CHOICE_TONES,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  allowedTypeChanges,
  choiceValueFromLabel,
  defaultFieldOptions,
  fieldKeyFromLabel,
  validateDatasetSchema,
  type ChoiceTone,
  type DatasetSchema,
  type FieldDefinition,
  type FieldType
} from "@byline/data";
import { Alert, AlertDescription } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldSet, FieldLegend } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { ArrowDown, ArrowUp, ChevronRight, Lock, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { DatasetDetail } from "../../data/server";

const TONE_LABELS: Record<ChoiceTone, string> = { neutral: "Neutral", positive: "Positive (done, won)", caution: "Caution (underway)", negative: "Negative (lost, late)", info: "Info" };
const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "MXN"];

/**
 * The dataset's fields, editors only. A field's key is permanent: rename it
 * whenever you like, and projects and releases keep working. Removing a
 * field retires its key for good. The server checks every change again
 * (types change only along value-preserving paths; a choice still in use
 * can't be removed).
 */
export function FieldsSheet({ open, onOpenChange, detail, focus, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: DatasetDetail;
  /** A field to open, `null` to add a new one, undefined for none. */
  focus: string | null | undefined;
  onSave: (input: { title: string; description: string; schema: DatasetSchema }) => Promise<void>;
}) {
  const id = useId();
  const original = detail.dataset.schema;
  const [title, setTitle] = useState(detail.dataset.title);
  const [description, setDescription] = useState(detail.dataset.description);
  const [fields, setFields] = useState<FieldDefinition[]>(original.fields);
  const [retired, setRetired] = useState<string[]>(original.retiredKeys);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(detail.dataset.title);
    setDescription(detail.dataset.description);
    setFields(original.fields);
    setRetired(original.retiredKeys);
    setError(null);
    if (focus === null) {
      const key = fieldKeyFromLabel("New field", [...original.fields.map((entry) => entry.key), ...original.retiredKeys]);
      setFields([...original.fields, { key, label: "New field", type: "text", required: false, visibility: "public", options: defaultFieldOptions("text") }]);
      setExpanded(key);
    } else setExpanded(focus ?? null);
    // Reset only when the sheet opens: a background refetch must never discard edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focus]);

  const existing = new Map(original.fields.map((entry) => [entry.key, entry]));
  const taken = () => [...fields.map((entry) => entry.key), ...retired];
  const replace = (key: string, next: FieldDefinition) => setFields((current) => current.map((entry) => (entry.key === key ? next : entry)));
  const move = (index: number, by: number) => setFields((current) => {
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    return next;
  });
  const remove = (key: string) => {
    setFields((current) => current.filter((entry) => entry.key !== key));
    if (existing.has(key)) setRetired((current) => [...current, key]);
  };
  const add = () => {
    const key = fieldKeyFromLabel("New field", taken());
    setFields((current) => [...current, { key, label: "New field", type: "text", required: false, visibility: "public", options: defaultFieldOptions("text") }]);
    setExpanded(key);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // A brand-new field takes its permanent key from the label it is saved with.
    const keys = new Set<string>([...original.fields.map((entry) => entry.key), ...retired]);
    const finalFields = fields.map((entry) => {
      if (existing.has(entry.key)) return entry;
      const key = fieldKeyFromLabel(entry.label, keys);
      keys.add(key);
      return { ...entry, key };
    });
    const schema: DatasetSchema = { fields: finalFields, retiredKeys: retired };
    const checked = validateDatasetSchema(schema, { datasetKey: detail.dataset.key });
    if (!checked.ok) return setError(checked.issues.map((issue) => issue.message).join(" "));
    if (!title.trim()) return setError("Name the dataset.");
    setBusy(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), description: description.trim(), schema });
      onOpenChange(false);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <form onSubmit={submit} className="flex h-full min-h-0 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle>Fields</SheetTitle>
            <SheetDescription>Each field is a column. Its key never changes, so you can rename it whenever you like without breaking a project.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup className="gap-5">
              <FieldSet>
                <FieldLegend variant="label">Dataset</FieldLegend>
                <div className="grid gap-3">
                  <Field>
                    <FieldLabel htmlFor={`${id}-title`}>Name</FieldLabel>
                    <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
                    <Input id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
                    <FieldDescription>Key <code className="font-mono">{detail.dataset.key}</code> · permanent</FieldDescription>
                  </Field>
                </div>
              </FieldSet>
              <FieldSeparator />
              <FieldSet>
                <FieldLegend variant="label">Fields <span className="font-normal text-muted-foreground">({fields.length})</span></FieldLegend>
                <ul className="grid gap-2">
                  {fields.map((field, index) => (
                    <FieldEditor
                      key={field.key}
                      field={field}
                      original={existing.get(field.key)}
                      open={expanded === field.key}
                      onOpenChange={(next) => setExpanded(next ? field.key : null)}
                      onChange={(next) => replace(field.key, next)}
                      onUp={index > 0 ? () => move(index, -1) : undefined}
                      onDown={index < fields.length - 1 ? () => move(index, 1) : undefined}
                      onRemove={() => remove(field.key)}
                      linkable={detail.linkable}
                    />
                  ))}
                </ul>
                <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={add}><Plus data-icon="inline-start" />Add field</Button>
              </FieldSet>
            </FieldGroup>
          </div>
          <SheetFooter className="border-t">
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}Save fields</Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FieldEditor({ field, original, open, onOpenChange, onChange, onUp, onDown, onRemove, linkable }: {
  field: FieldDefinition;
  original: FieldDefinition | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (field: FieldDefinition) => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
  linkable: DatasetDetail["linkable"];
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const types: readonly FieldType[] = original ? allowedTypeChanges(original.type) : FIELD_TYPES;
  const setType = (type: FieldType) => onChange({ ...field, type, options: type === original?.type ? original.options : field.type === type ? field.options : defaultFieldOptions(type) } as FieldDefinition);
  const options = field.options as Record<string, unknown>;
  const setOption = (name: string, value: unknown) => onChange({ ...field, options: { ...options, [name]: value === "" || value === undefined ? undefined : value } } as FieldDefinition);
  return (
    <li className={cn("rounded-lg border", open && "ring-1 ring-ring/30")}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center gap-1 pr-1">
          <CollapsibleTrigger render={<button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
            <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
            <span className="truncate text-sm font-medium">{field.label || "Untitled field"}</span>
            {field.required ? <span className="text-destructive" aria-label="required">*</span> : null}
            <Badge variant="outline" className="ml-auto shrink-0 font-normal">{FIELD_TYPE_LABELS[field.type].label}</Badge>
            {field.visibility === "private" ? <Badge variant="secondary" className="shrink-0 font-normal"><Lock />Private</Badge> : null}
          </CollapsibleTrigger>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${field.label} up`} disabled={!onUp} onClick={onUp}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${field.label} down`} disabled={!onDown} onClick={onDown}><ArrowDown /></Button>
        </div>
        <CollapsibleContent>
          <div className="grid gap-4 border-t px-3 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-label`}>Label</FieldLabel>
                <Input id={`${id}-label`} value={field.label} onChange={(event) => onChange({ ...field, label: event.target.value })} maxLength={120} autoFocus={!original} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
                <Select items={types.map((type) => ({ value: type, label: FIELD_TYPE_LABELS[type].label }))} value={field.type} onValueChange={(next) => setType(next as FieldType)}>
                  <SelectTrigger id={`${id}-type`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type} value={type}>{FIELD_TYPE_LABELS[type].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{original && types.length === 1 ? "This type can't change once a field has values. Add a new field instead." : FIELD_TYPE_LABELS[field.type].description}</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${id}-help`}>Help text <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id={`${id}-help`} value={field.description ?? ""} onChange={(event) => onChange({ ...field, description: event.target.value || undefined })} maxLength={300} placeholder="What goes in this column" />
            </Field>
            <TypeOptions field={field} setOption={setOption} onChange={onChange} linkable={linkable} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-public`}>Public</FieldLabel>
                  <FieldDescription>{field.visibility === "public" ? "Published with the data." : "Stays in the newsroom. Never in published data."}</FieldDescription>
                </FieldContent>
                <Switch id={`${id}-public`} checked={field.visibility === "public"} onCheckedChange={(checked) => onChange({ ...field, visibility: checked ? "public" : "private" })} />
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-required`}>Required to publish</FieldLabel>
                  <FieldDescription>Rows can be saved without it.</FieldDescription>
                </FieldContent>
                <Switch id={`${id}-required`} checked={field.required} onCheckedChange={(checked) => onChange({ ...field, required: checked })} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">{original ? <>Key <code className="font-mono">{field.key}</code> · permanent</> : "The key is set from the label when you save."}</p>
              {confirming ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{original ? "Its values leave this dataset." : "Discard this field?"}</span>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
                  <Button type="button" size="xs" variant="destructive" onClick={onRemove}>Remove</Button>
                </span>
              ) : (
                <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)}><Trash2 data-icon="inline-start" />Remove field</Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function NumberInput({ id, label, value, onChange, step }: { id: string; label: string; value: unknown; onChange: (value: number | undefined) => void; step?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="number" step={step ?? "any"} value={value === undefined || value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />
    </Field>
  );
}

function TypeOptions({ field, setOption, onChange, linkable }: { field: FieldDefinition; setOption: (name: string, value: unknown) => void; onChange: (field: FieldDefinition) => void; linkable: DatasetDetail["linkable"] }) {
  const id = useId();
  switch (field.type) {
    case "text":
    case "longText":
      return <div className="grid gap-3 sm:grid-cols-2"><NumberInput id={`${id}-max`} label="Longest allowed (characters)" value={field.options.maxLength} step="1" onChange={(value) => setOption("maxLength", value ?? (field.type === "text" ? 500 : 10_000))} /></div>;
    case "integer":
      return <div className="grid gap-3 sm:grid-cols-2"><NumberInput id={`${id}-min`} label="Smallest" step="1" value={field.options.min} onChange={(value) => setOption("min", value)} /><NumberInput id={`${id}-max`} label="Largest" step="1" value={field.options.max} onChange={(value) => setOption("max", value)} /></div>;
    case "number":
    case "percentage":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberInput id={`${id}-min`} label="Smallest" value={field.options.min} onChange={(value) => setOption("min", value)} />
          <NumberInput id={`${id}-max`} label="Largest" value={field.options.max} onChange={(value) => setOption("max", value)} />
          <NumberInput id={`${id}-decimals`} label="Decimal places shown" step="1" value={field.options.decimals} onChange={(value) => setOption("decimals", value)} />
        </div>
      );
    case "currency":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-currency`}>Currency</FieldLabel>
            <Select items={CURRENCIES.map((code) => ({ value: code, label: code }))} value={field.options.currency} onValueChange={(next) => setOption("currency", String(next))}>
              <SelectTrigger id={`${id}-currency`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <NumberInput id={`${id}-scale`} label="Decimal places" step="1" value={field.options.scale} onChange={(value) => setOption("scale", Math.max(0, Math.min(6, value ?? 2)))} />
        </div>
      );
    case "select": {
      const choices = field.options.choices;
      const update = (next: typeof choices) => onChange({ ...field, options: { choices: next } });
      return (
        <FieldSet>
          <FieldLegend variant="label">Choices</FieldLegend>
          <ul className="grid gap-2">
            {choices.map((choice, index) => (
              <li key={choice.value} className="grid grid-cols-[minmax(0,1fr)_10rem_auto] items-center gap-2">
                <Input aria-label={`Choice ${index + 1}`} value={choice.label} onChange={(event) => update(choices.map((entry) => (entry.value === choice.value ? { ...entry, label: event.target.value } : entry)))} maxLength={120} />
                <Select items={CHOICE_TONES.map((tone) => ({ value: tone, label: TONE_LABELS[tone] }))} value={choice.tone ?? "neutral"} onValueChange={(next) => update(choices.map((entry) => (entry.value === choice.value ? { ...entry, tone: next === "neutral" ? undefined : (next as ChoiceTone) } : entry)))}>
                  <SelectTrigger aria-label={`${choice.label} tone`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CHOICE_TONES.map((tone) => <SelectItem key={tone} value={tone}>{TONE_LABELS[tone]}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${choice.label}`} onClick={() => update(choices.filter((entry) => entry.value !== choice.value))}><X /></Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => {
            const label = `Choice ${choices.length + 1}`;
            update([...choices, { value: choiceValueFromLabel(label, choices.map((entry) => entry.value)), label }]);
          }}><Plus data-icon="inline-start" />Add choice</Button>
          <FieldDescription>Tones tell a presentation what a choice means (done, underway, lost). They never set colors.</FieldDescription>
        </FieldSet>
      );
    }
    case "relationship":
      return (
        <Field>
          <FieldLabel htmlFor={`${id}-target`}>Links to a row in</FieldLabel>
          <Select items={linkable.map((entry) => ({ value: entry.key, label: entry.title }))} value={field.options.dataset || null} onValueChange={(next) => setOption("dataset", String(next))}>
            <SelectTrigger id={`${id}-target`} className="w-full"><SelectValue placeholder="Choose a dataset" /></SelectTrigger>
            <SelectContent>{linkable.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.title}</SelectItem>)}</SelectContent>
          </Select>
          <FieldDescription>A linked row must be published in its own dataset before this one can be published.</FieldDescription>
        </Field>
      );
    default:
      return null;
  }
}
