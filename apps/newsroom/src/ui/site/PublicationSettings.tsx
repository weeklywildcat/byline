"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import type { PublicationSettings as Settings, SettingField } from "../../newsroom/site";
import { createBylineRequest } from "../home/payload-fetchers";
import { useNewsroomRoutes } from "../shell/account";
import { useLeaveGuard } from "../shell/navigation";

type RecordValues = Record<string, unknown>;
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValues : {};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? value : "";
function SettingsFields({ fields, values, onChange }: { fields: SettingField[]; values: RecordValues; onChange: (value: RecordValues) => void }) {
  return <div className="grid gap-3">{fields.map((field) => <Setting key={field.name} field={field} value={values[field.name]} change={(value) => onChange({ ...values, [field.name]: value })} />)}</div>;
}

function Setting({ field, value, change }: { field: SettingField; value: unknown; change: (value: unknown) => void }) {
  const id = useId();
  const children = field.children ?? [];
  const options = field.options ?? [];
  if (field.type === "group") return <fieldset className="grid min-w-0 gap-2">
    <legend className="pb-1 text-sm font-medium">{field.label}</legend>
    {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
    <SettingsFields fields={children} values={object(value)} onChange={change} />
  </fieldset>;
  if (field.type === "array") {
    const rows = Array.isArray(value) ? value.map(object) : [];
    function move(index: number, to: number) {
      const next = rows.slice(); [next[index], next[to]] = [next[to], next[index]]; change(next);
    }
    return <fieldset className="grid min-w-0 gap-2">
      <legend className="pb-1 text-sm font-medium">{field.label}</legend>
      {rows.map((row, index) => <div key={index} className="grid gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-auto text-xs font-medium">{field.label} {index + 1}</span>
          <Button type="button" size="xs" variant="outline" disabled={!index} onClick={() => move(index, index - 1)} aria-label={`Move item ${index + 1} up`}>Up</Button>
          <Button type="button" size="xs" variant="outline" disabled={index === rows.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move item ${index + 1} down`}>Down</Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => change(rows.filter((_, i) => i !== index))} aria-label={`Remove item ${index + 1}`}>Remove</Button>
        </div>
        <SettingsFields fields={children} values={row} onChange={(next) => change(rows.map((item, i) => i === index ? next : item))} />
      </div>)}
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={field.maxRows !== undefined && rows.length >= field.maxRows} onClick={() => change([...rows, Object.fromEntries(children.filter((child) => child.defaultValue !== undefined).map((child) => [child.name, child.defaultValue]))])}>Add item</Button>
    </fieldset>;
  }
  if (field.type === "checkbox") return <label className="flex items-center gap-2 text-sm"><Checkbox checked={value === true} onCheckedChange={change} />{field.label}</label>;
  if (field.type === "select" && field.hasMany) {
    const selected: string[] = Array.isArray(value) ? value : [];
    return <fieldset className="flex flex-wrap gap-3 text-sm"><legend className="pb-1">{field.label}</legend>
      {options.map(({ label, value: key }) => <label key={key} className="flex items-center gap-2"><Checkbox checked={selected.includes(key)} onCheckedChange={(checked) => change(checked ? [...selected, key] : selected.filter((v) => v !== key))} />{label}</label>)}
    </fieldset>;
  }
  return <div className="grid gap-1 text-sm">
    <label htmlFor={id}>{field.label}</label>
    {field.type === "select" ? <Select items={[{ value: "", label: "None" }, ...options]} value={String(value ?? "")} onValueChange={(next) => change(next || null)}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{[{ value: "", label: "None" }, ...options].map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
    </Select> : field.type === "textarea" ? <Textarea id={id} value={text(value)} onChange={(event) => change(event.target.value)} rows={3} /> :
      <Input id={id} type={field.type === "number" ? "number" : "text"} value={text(value)} onChange={(event) => change(field.type === "number" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value)} />}
    {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
  </div>;
}

export function PublicationSettingsPanel() {
  const { api } = useNewsroomRoutes();
  const request = createBylineRequest(api);
  const response = useQuery({ queryKey: ["byline", "site", "publication"], queryFn: () => request<Settings>("/site/publication"), refetchOnWindowFocus: false });
  if (response.isPending) return <p role="status">Loading publication settings…</p>;
  if (response.isError) return <p role="alert">Publication settings could not be loaded. <Button type="button" onClick={() => void response.refetch()}>Retry</Button></p>;
  return <PublicationForm key={response.data.revision ?? "new"} settings={response.data} refresh={async () => { await response.refetch(); }} />;
}

function PublicationForm({ settings, refresh }: { settings: Settings; refresh: () => Promise<void> }) {
  const { api } = useNewsroomRoutes();
  const [values, setValues] = useState(settings.values);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = useRef({ dirty, busy });
  editing.current = { dirty, busy };
  useLeaveGuard(() => ({ modified: editing.current.dirty, saving: editing.current.busy, explicit: true, description: "Your publication settings have unsaved changes." }));

  async function save(publish: boolean) {
    setBusy(true); setError("");
    try {
      await createBylineRequest(api)("/site/publication", "POST", { values, expected: settings.revision, publish });
      setDirty(false);
      toast.success(publish ? "Publication settings published." : "Publication draft saved.");
      await refresh();
    } catch (error) {
      setError((error as { message?: string }).message ?? "The settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{settings.hasDraft ? "Unpublished settings draft" : settings.hasPublished ? "Published settings" : "Weekly Wildcat defaults apply until settings are published."}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!dirty || busy} onClick={() => void save(false)}>Save draft</Button>
        <Button type="button" size="sm" disabled={busy || (!dirty && !settings.hasDraft && settings.hasPublished)} onClick={() => void save(true)}>Publish settings</Button>
      </div>
    </div>
    {error ? <p className="text-sm text-destructive" role="alert">{error} <Button type="button" size="xs" variant="outline" onClick={() => void refresh()}>Reload settings</Button></p> : null}
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {settings.fields.map((field) => <Card key={field.name} size="sm" className={field.type === "array" ? "lg:col-span-2" : ""}>
        <CardHeader><CardTitle role="heading" aria-level={2}>{field.label}</CardTitle></CardHeader>
        <CardContent>{field.type === "group" ? <>
          {field.description ? <p className="mb-2 text-xs text-muted-foreground">{field.description}</p> : null}
          <SettingsFields fields={field.children ?? []} values={object(values[field.name])} onChange={(value) => { setValues({ ...values, [field.name]: value }); setDirty(true); }} />
        </> : <Setting field={field} value={values[field.name]} change={(value) => { setValues({ ...values, [field.name]: value }); setDirty(true); }} />}</CardContent>
      </Card>)}
    </div>
  </div>;
}
