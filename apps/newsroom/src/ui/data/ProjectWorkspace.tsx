"use client";

import { FIELD_TYPE_LABELS, canonicalJson, type DataPresentationDescriptor, type ProjectBinding, type SettingDescriptor } from "@byline/data";
import { DisabledReason } from "@byline/newsroom-ui/components/disabled-reason";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@byline/newsroom-ui/ui/breadcrumb";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Lock, Monitor, MoreHorizontal, Plus, RefreshCw, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState, } from "react";
import { toast } from "sonner";
import type { ProjectDetail } from "../../data/server";
import { useNewsroomRoutes } from "../shell/account";
import { useLeaveGuard } from "../shell/navigation";
import { dataKeys, fetchProject, publishProject, saveProject, searchStories, unpublishProject } from "./api";
import { presentationNeeds } from "./CreateProjectDialog";
import { useDataNavigation } from "./DataWorkspace";
import { DatasetStatus, formatWhen, ProjectStatus, shortSha } from "./status";

type Draft = ProjectDetail["project"];
const NONE = "__none__";
/** Below this width the preview moves under the form. */
const SIDE_BY_SIDE = 1080;

const editable = (project: Draft) => ({ title: project.title, slug: project.slug, deck: project.deck, presentation: project.presentation, bindings: project.bindings, settings: project.settings, source: project.source, methodology: project.methodology, indexing: project.indexing, relatedStories: project.relatedStories.map((story) => story.id) });

/**
 * One Data Project: what readers see. The form saves a Payload draft (the
 * public page changes only on Publish); the preview beside it is the real
 * public renderer, with working data or with exactly the published releases.
 */
export function ProjectWorkspace({ id }: { id: number }) {
  // The measured wrapper is always mounted, so the layout knows its width before the project loads.
  const [layoutRef, width] = useElementWidth<HTMLDivElement>();
  return <div ref={layoutRef} className="w-full min-w-0"><ProjectBody id={id} width={width} /></div>;
}

function ProjectBody({ id, width }: { id: number; width: number }) {
  const { api, admin } = useNewsroomRoutes();
  const go = useDataNavigation();
  const queries = useQueryClient();
  const project = useQuery({ queryKey: dataKeys.project(id), queryFn: () => fetchProject(api, id) });
  const detail = project.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [source, setSource] = useState<"working" | "published">("working");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [confirm, setConfirm] = useState<"unpublish" | null>(null);
  const [frameVersion, setFrameVersion] = useState(0);
  useEffect(() => {
    if (detail && (!draft || draft.id !== detail.project.id)) setDraft(detail.project);
  }, [detail, draft]);

  const modified = Boolean(detail && draft && canonicalJson(editable(draft)) !== canonicalJson(editable(detail.project)));
  const saveMutation = useMutation({
    mutationFn: () => saveProject(api, id, { ...editable(draft!), expectedUpdatedAt: detail!.project.updatedAt }),
    onSuccess: (next) => {
      queries.setQueryData(dataKeys.project(id), next);
      setDraft(next.project);
      setFrameVersion((value) => value + 1);
      void queries.invalidateQueries({ queryKey: dataKeys.overview() });
      toast.success(next.publication === "draft" ? "Draft saved." : "Changes saved. Publish them to update the public page.");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const publicationMutation = useMutation({
    mutationFn: (action: "publish" | "unpublish") => (action === "publish" ? publishProject(api, id) : unpublishProject(api, id)),
    onSuccess: (next, action) => {
      queries.setQueryData(dataKeys.project(id), next);
      setDraft(next.project);
      setFrameVersion((value) => value + 1);
      void queries.invalidateQueries({ queryKey: dataKeys.overview() });
      toast.success(action === "publish" ? "Published. The page goes live with the next site build." : "Unpublished. The page comes down with the next site build.");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  useLeaveGuard(useCallback(() => ({ modified, saving: saveMutation.isPending, explicit: true, description: "This project has changes you haven't saved." }), [modified, saveMutation.isPending]));

  if (project.isError) return <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-6"><InlineAlert title="This project isn't available" onAction={() => void project.refetch()}>{(project.error as Error).message}</InlineAlert></main>;
  if (!detail || !draft) return <main className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-6 lg:px-6" aria-busy="true"><Skeleton className="h-4 w-48" /><Skeleton className="h-8 w-80" /><Skeleton className="h-[32rem] w-full" /></main>;

  const descriptor = detail.presentations.find((entry) => entry.key === draft.presentation) ?? null;
  const canManage = detail.capabilities.manageProjects;
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const serverRoot = admin.replace(/\/admin$/, "");
  const previewSrc = `${serverRoot}/preview/data?project=${id}&data=${source}&v=${detail.project.updatedAt}-${frameVersion}`;
  const sideBySide = width >= SIDE_BY_SIDE;
  const publishReason = !canManage ? "Only editors publish projects." : modified ? "Save your changes first." : detail.issues.length ? "Fix the problems listed first." : detail.publication === "published" ? "Nothing new to publish." : undefined;

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-4 px-4 py-5 lg:px-6" data-byline-data-project={detail.project.slug}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<button type="button" onClick={() => go({ tab: "projects" })} />}>Data</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<button type="button" onClick={() => go({ tab: "projects" })} />}>Projects</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{detail.project.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{detail.project.title}</h1>
            <ProjectStatus publication={detail.publication} />
            {modified ? <Badge variant="outline" className="font-normal">Not saved</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {detail.publicUrl ? (
              <>
                <a href={detail.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">{detail.publicUrl.replace(/^https?:\/\//, "")}<ExternalLink className="size-3.5" /></a>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Copy the public address" onClick={() => void navigator.clipboard.writeText(detail.publicUrl!).then(() => toast.success("Address copied."))}><Copy /></Button>
                {detail.publishedAt ? <span>· Published {formatWhen(detail.publishedAt, detail.timeZone)}</span> : null}
              </>
            ) : <span>Not published. It will be at /data/{draft.slug}/.</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!modified || saveMutation.isPending || !canManage} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Spinner data-icon="inline-start" /> : null}Save draft</Button>
          <DisabledReason reason={publicationMutation.isPending ? undefined : publishReason}>
            <Button type="button" size="sm" disabled={Boolean(publishReason) || publicationMutation.isPending} onClick={() => publicationMutation.mutate("publish")}>{publicationMutation.isPending ? <Spinner data-icon="inline-start" /> : null}{detail.publication === "changed" ? "Publish changes" : "Publish"}</Button>
          </DisabledReason>
          {detail.publication !== "draft" && canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="More project actions" />}><MoreHorizontal /></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => setConfirm("unpublish")}>Unpublish…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      {detail.issues.length && !modified ? (
        <Alert>
          <AlertTitle>Before this can be published</AlertTitle>
          <AlertDescription><ul className="list-disc pl-4">{detail.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 items-start gap-6" style={sideBySide ? { gridTemplateColumns: "minmax(22rem, 30rem) minmax(0, 1fr)" } : undefined}>
        <form className="min-w-0" onSubmit={(event) => { event.preventDefault(); if (modified) saveMutation.mutate(); }} noValidate>
          <fieldset disabled={!canManage} className="min-w-0">
            <FieldGroup className="gap-6">
              <FieldSet>
                <FieldLegend>Page</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="data-project-title">Headline</FieldLabel>
                  <Input id="data-project-title" value={draft.title} maxLength={200} onChange={(event) => update({ title: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="data-project-deck">Deck</FieldLabel>
                  <Textarea id="data-project-deck" value={draft.deck} rows={2} maxLength={600} onChange={(event) => update({ deck: event.target.value })} placeholder="One or two sentences on what readers can learn here" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="data-project-slug">Web address</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon className="font-mono text-xs">/data/</InputGroupAddon>
                    <InputGroupInput id="data-project-slug" className="font-mono text-sm" value={draft.slug} maxLength={80} onChange={(event) => update({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-") })} />
                  </InputGroup>
                  {detail.publication !== "draft" && draft.slug !== detail.project.slug ? <FieldDescription className="text-warning">Changing a published address breaks links to the old one.</FieldDescription> : null}
                </Field>
              </FieldSet>
              <FieldSeparator />
              <PresentationSection detail={detail} draft={draft} descriptor={descriptor} update={update} />
              <FieldSeparator />
              <FieldSet>
                <FieldLegend>For readers</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="data-project-source">Source</FieldLabel>
                  <Input id="data-project-source" value={draft.source} maxLength={600} onChange={(event) => update({ source: event.target.value })} placeholder="City engineering department; Weekly Wildcat reporting" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="data-project-methodology">About this data</FieldLabel>
                  <Textarea id="data-project-methodology" value={draft.methodology} rows={4} maxLength={5000} onChange={(event) => update({ methodology: event.target.value })} placeholder="How the data was gathered and checked, and how often it's updated." />
                </Field>
                <RelatedStories draft={draft} update={update} />
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="data-project-indexing">Show in search engines</FieldLabel>
                    <FieldDescription>Off keeps the page out of search results and the sitemap.</FieldDescription>
                  </FieldContent>
                  <Switch id="data-project-indexing" checked={draft.indexing === "public"} onCheckedChange={(checked) => update({ indexing: checked ? "public" : "noindex" })} />
                </Field>
              </FieldSet>
              <FieldSeparator />
              <FieldSet>
                <FieldLegend>Published data in use</FieldLegend>
                <FieldDescription>The public page shows exactly these releases. Editing a dataset never changes it; publishing the dataset again does.</FieldDescription>
                {detail.releases.length ? (
                  <ul className="grid gap-2">
                    {detail.releases.map((entry) => {
                      const dataset = detail.datasets.find((candidate) => candidate.key === entry.dataset);
                      return (
                        <li key={entry.dataset} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                          <span className="min-w-0">
                            <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => dataset && go({ dataset: dataset.id })}>{entry.title}</button>
                            <span className="block text-xs text-muted-foreground">{entry.release ? <>Release <code className="font-mono">{shortSha(entry.release.sha256)}</code> · {formatWhen(entry.release.releasedAt, detail.timeZone)} · {entry.release.records} rows</> : "No published release yet"}</span>
                          </span>
                          <DatasetStatus publication={entry.publication} />
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">Choose a dataset above.</p>}
              </FieldSet>
            </FieldGroup>
          </fieldset>
        </form>

        <section className={sideBySide ? "sticky top-20 grid gap-2" : "grid gap-2"} aria-label="Preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Data shown" value={[source]} onValueChange={(next: unknown[]) => { if (next[0] === "working" || next[0] === "published") setSource(next[0]); }}>
              <ToggleGroupItem value="working">Working data</ToggleGroupItem>
              <ToggleGroupItem value="published">Published data</ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center gap-2">
              {modified ? <span className="text-xs text-muted-foreground">Save to update the preview</span> : null}
              <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="Preview width" value={[device]} onValueChange={(next: unknown[]) => { if (next[0] === "desktop" || next[0] === "mobile") setDevice(next[0]); }}>
                <ToggleGroupItem value="desktop" aria-label="Desktop"><Monitor /></ToggleGroupItem>
                <ToggleGroupItem value="mobile" aria-label="Mobile"><Smartphone /></ToggleGroupItem>
              </ToggleGroup>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Reload preview" onClick={() => setFrameVersion((value) => value + 1)}><RefreshCw /></Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{source === "working" ? "Working data: every row and field as it is in the newsroom now, including what readers won't see." : "Published data: exactly what readers get from the current releases."}</p>
          <div className="overflow-hidden rounded-lg border bg-muted/40">
            <iframe key={previewSrc} title={`Preview of ${detail.project.title} (${source === "working" ? "working" : "published"} data)`} src={previewSrc} className="mx-auto block border-0 bg-white" style={{ width: device === "mobile" ? 390 : "100%", height: sideBySide ? "calc(100svh - 13rem)" : 720 }} />
          </div>
        </section>
      </div>

      <AlertDialog open={confirm === "unpublish"} onOpenChange={(open) => setConfirm(open ? "unpublish" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish {detail.project.title}?</AlertDialogTitle>
            <AlertDialogDescription>The page and its address leave the public site with the next build. The datasets and their releases stay as they are.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it published</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => publicationMutation.mutate("unpublish")}>Unpublish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function PresentationSection({ detail, draft, descriptor, update }: { detail: ProjectDetail; draft: Draft; descriptor: DataPresentationDescriptor | null; update: (patch: Partial<Draft>) => void }) {
  const templates = detail.presentations.filter((entry) => entry.kind === "template");
  const custom = detail.presentations.filter((entry) => entry.kind === "custom");
  const setBinding = (slot: string, next: ProjectBinding | null) => update({ bindings: [...draft.bindings.filter((binding) => binding.slot !== slot), ...(next ? [next] : [])] });
  return (
    <FieldSet>
      <FieldLegend>Presentation</FieldLegend>
      <Field>
        <FieldLabel htmlFor="data-project-presentation">Readers see it as</FieldLabel>
        <Select items={detail.presentations.map((entry) => ({ value: entry.key, label: entry.name }))} value={draft.presentation} onValueChange={(next) => {
          const target = detail.presentations.find((entry) => entry.key === next);
          if (!target) return;
          update({ presentation: target.key, presentationKind: target.kind, settings: Object.fromEntries(target.settings.map((entry) => [entry.key, entry.default])), bindings: draft.bindings.filter((binding) => target.slots.some((slot) => slot.key === binding.slot)) });
        }}>
          <SelectTrigger id="data-project-presentation" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {templates.length ? <SelectGroup><SelectLabel>Templates</SelectLabel>{templates.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.name}</SelectItem>)}</SelectGroup> : null}
            {custom.length ? <SelectGroup><SelectLabel>Custom</SelectLabel>{custom.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.name}</SelectItem>)}</SelectGroup> : null}
          </SelectContent>
        </Select>
        {descriptor ? <FieldDescription>{descriptor.description} <span className="text-foreground/80">Needs {presentationNeeds(descriptor)}.</span></FieldDescription> : <FieldDescription className="text-destructive">This presentation isn't in this build. Choose another, or ask a developer.</FieldDescription>}
      </Field>
      {descriptor?.slots.map((slot) => {
        const binding = draft.bindings.find((entry) => entry.slot === slot.key) ?? null;
        const dataset = binding ? detail.datasets.find((entry) => entry.key === binding.dataset) : undefined;
        return (
          <div key={slot.key} className="grid gap-3 rounded-lg border p-3" data-data-slot={slot.key}>
            <Field>
              <FieldLabel htmlFor={`data-slot-${slot.key}`}>{slot.label}{!slot.required ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}</FieldLabel>
              <Select items={[{ value: NONE, label: "No dataset" }, ...detail.datasets.map((entry) => ({ value: entry.key, label: entry.title }))]} value={binding?.dataset ?? NONE} onValueChange={(next) => {
                if (next === NONE || !next) return setBinding(slot.key, null);
                const target = detail.datasets.find((entry) => entry.key === next);
                const fields: Record<string, string> = {};
                const used = new Set<string>();
                for (const [role, requirement] of Object.entries(slot.fields)) {
                  const match = target?.fields.find((field) => !used.has(field.key) && requirement.types.includes(field.type) && (field.label.toLowerCase() === requirement.label.toLowerCase() || field.key === role)) ?? (requirement.required ? target?.fields.find((field) => !used.has(field.key) && requirement.types.includes(field.type)) : undefined);
                  if (match) {
                    fields[role] = match.key;
                    used.add(match.key);
                  }
                }
                setBinding(slot.key, { slot: slot.key, dataset: String(next), fields });
              }}>
                <SelectTrigger id={`data-slot-${slot.key}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {!slot.required ? <SelectItem value={NONE}>No dataset</SelectItem> : null}
                  {detail.datasets.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {slot.description ? <FieldDescription>{slot.description}</FieldDescription> : null}
              {dataset && dataset.publication !== "published" ? <FieldDescription className="text-warning">{dataset.publication === "unpublished" ? "This dataset isn't published yet: publish it before the project." : "This dataset has edits readers don't have yet."}</FieldDescription> : null}
            </Field>
            {binding && dataset ? (
              <div className="grid gap-2">
                {Object.entries(slot.fields).map(([role, requirement]) => {
                  const options = dataset.fields.filter((field) => requirement.types.includes(field.type));
                  const chosen = dataset.fields.find((field) => field.key === binding.fields[role]);
                  const unpublishedField = chosen && dataset.release && !dataset.release.fieldKeys.includes(chosen.key);
                  return (
                    <div key={role} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3">
                      <label htmlFor={`data-role-${slot.key}-${role}`} className="text-sm">{requirement.label}{requirement.required ? <span className="text-destructive"> *</span> : null}</label>
                      <div className="grid gap-1">
                        <Select items={[{ value: NONE, label: "None" }, ...options.map((field) => ({ value: field.key, label: field.label }))]} value={binding.fields[role] ?? NONE} onValueChange={(next) => {
                          const fields = { ...binding.fields };
                          if (next === NONE || !next) delete fields[role];
                          else fields[role] = String(next);
                          setBinding(slot.key, { ...binding, fields });
                        }}>
                          <SelectTrigger id={`data-role-${slot.key}-${role}`} size="sm" className="w-full" aria-invalid={requirement.required && !chosen ? true : undefined}><SelectValue placeholder={options.length ? "Choose a field" : "No compatible field"} /></SelectTrigger>
                          <SelectContent>
                            {!requirement.required ? <SelectItem value={NONE}>None</SelectItem> : null}
                            {options.map((field) => (
                              <SelectItem key={field.key} value={field.key}>
                                <span className="flex items-center gap-1.5">{field.label}<span className="text-xs text-muted-foreground">{FIELD_TYPE_LABELS[field.type].label}</span>{field.visibility === "private" ? <Lock className="size-3 text-muted-foreground" aria-label="private" /> : null}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {chosen?.visibility === "private" ? <span className="text-xs text-warning">Private: shown in the working preview only. Make it public to publish.</span> : unpublishedField ? <span className="text-xs text-warning">Not in the published data yet.</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      {descriptor?.settings.length ? (
        <div className="grid gap-3">
          {descriptor.settings.map((entry) => <SettingField key={entry.key} setting={entry} value={draft.settings[entry.key]} onChange={(value) => update({ settings: { ...draft.settings, [entry.key]: value } })} />)}
        </div>
      ) : null}
    </FieldSet>
  );
}

function SettingField({ setting, value, onChange }: { setting: SettingDescriptor; value: unknown; onChange: (value: string | number | boolean) => void }) {
  const id = `data-setting-${setting.key}`;
  switch (setting.type) {
    case "boolean":
      return (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
            {setting.description ? <FieldDescription>{setting.description}</FieldDescription> : null}
          </FieldContent>
          <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
        </Field>
      );
    case "choice":
      return (
        <Field>
          <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
          <Select items={setting.choices} value={typeof value === "string" ? value : setting.default} onValueChange={(next) => onChange(String(next))}>
            <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{setting.choices.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent>
          </Select>
          {setting.description ? <FieldDescription>{setting.description}</FieldDescription> : null}
        </Field>
      );
    case "number":
      return (
        <Field>
          <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
          <Input id={id} type="number" min={setting.min} max={setting.max} step={setting.integer ? 1 : "any"} value={typeof value === "number" ? value : setting.default} onChange={(event) => onChange(event.target.value === "" ? setting.default : Number(event.target.value))} />
          {setting.description ? <FieldDescription>{setting.description}</FieldDescription> : null}
        </Field>
      );
    default:
      return (
        <Field>
          <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
          {setting.type === "longText" ? <Textarea id={id} rows={3} maxLength={setting.maxLength} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /> : <Input id={id} maxLength={setting.maxLength} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />}
          {setting.description ? <FieldDescription>{setting.description}</FieldDescription> : null}
        </Field>
      );
  }
}

function RelatedStories({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const { api } = useNewsroomRoutes();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const results = useQuery({ queryKey: ["byline", "data", "stories", search], queryFn: () => searchStories(api, search), enabled: open });
  const chosen = new Set(draft.relatedStories.map((story) => story.id));
  return (
    <Field>
      <FieldLabel>Related coverage</FieldLabel>
      {draft.relatedStories.length ? (
        <ul className="grid gap-1.5">
          {draft.relatedStories.map((story) => (
            <li key={story.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              <span className="min-w-0 truncate">{story.headline}{!story.published ? <span className="text-muted-foreground"> · not published, left off the page</span> : null}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${story.headline}`} onClick={() => update({ relatedStories: draft.relatedStories.filter((entry) => entry.id !== story.id) })}><X /></Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={draft.relatedStories.length >= 12} />}><Plus data-icon="inline-start" />Add a story</PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search published stories" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{results.isFetching ? "Searching…" : "No published stories match."}</CommandEmpty>
              <CommandGroup>
                {(results.data?.stories ?? []).filter((story) => !chosen.has(story.id)).map((story) => (
                  <CommandItem key={story.id} value={String(story.id)} onSelect={() => {
                    update({ relatedStories: [...draft.relatedStories, { id: story.id, headline: story.headline, published: true }] });
                    setOpen(false);
                  }}>{story.headline}</CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <FieldDescription>Published stories about this data, listed under it.</FieldDescription>
    </Field>
  );
}
