import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, FileText, Folder, Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "../admin-ui/components/empty-state";
import { SelectField, TextField } from "../admin-ui/components/form-fields";
import { ItemList } from "../admin-ui/components/item-list";
import { Panel } from "../admin-ui/components/panel";
import { Button } from "../admin-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { WorkspaceDialog } from "./dialog-shell";
import { AddButton, SectionFailed } from "./parts";
import { useDialogTarget } from "./dialog-target";
import { RESOURCE_PURPOSE_LABELS } from "./reporting-model";
import { isHttpUrl, normalizePurpose, resourceSubtitle, validateLink } from "./resource-model";
import { applyResources } from "./workspace-cache";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { workspaceError } from "./workspace-errors";
import { RESOURCE_PURPOSES, type ResourcePurpose, type StoryResource } from "./workspace-types";

const purposeOptions = RESOURCE_PURPOSES.map((value) => ({ value, label: RESOURCE_PURPOSE_LABELS[value] }));

type LinkDraft = { label: string; url: string; purpose: ResourcePurpose };

function resourceIcon(resource: StoryResource) {
  if (resource.purpose === "folder" || /folder/i.test(resource.kind)) return Folder;
  return /doc|sheet|slides|pdf/i.test(resource.kind) || resource.purpose === "draft" ? FileText : Link2;
}

function LinkDialog({ open, resource, onClose, finalFocus }: { open: boolean; resource: StoryResource | null; onClose: () => void; finalFocus: () => HTMLElement | null }) {
  const { storyId, client, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const [draft, setDraft] = useState<LinkDraft>(() => resource ? { label: resource.label, url: resource.url, purpose: normalizePurpose(resource.purpose) } : { label: "", url: "", purpose: "other" });
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const errors = attempted ? validateLink(draft) : {};
  const patch = (changes: Partial<LinkDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const save = useMutation({
    mutationFn: (input: LinkDraft) => resource ? client.updateResource(storyId, resource.id, input) : client.addResource(storyId, input),
    onSuccess: (response: { resources: StoryResource[] }) => { cache.write((current) => applyResources(current, response.resources)); announce(resource ? "Link saved." : "Link added."); toast.success(resource ? "Link saved." : "Link added."); onClose(); },
    onError: (failure: unknown) => setError(workspaceError(failure, "The link couldn't be saved. Try again.").message),
    onSettled: () => { void cache.invalidate(); }
  });
  return <WorkspaceDialog open={open} onClose={onClose} finalFocus={finalFocus} title={resource ? "Edit link" : "Add link"} description="A document, folder or page the team works from." submitLabel={resource ? "Save link" : "Add link"} pending={save.isPending} error={error}
    onSubmit={() => { setAttempted(true); setError(""); if (Object.keys(validateLink(draft)).length === 0) save.mutate({ ...draft, label: draft.label.trim(), url: draft.url.trim() }); }}>
    <TextField label="Label" value={draft.label} onChange={(label) => patch({ label })} error={errors.label} maxLength={120} autoFocus placeholder="Interview notes" />
    <TextField label="Link" type="url" value={draft.url} onChange={(url) => patch({ url })} error={errors.url} maxLength={2048} placeholder="https://…" />
    <SelectField label="What is it?" value={draft.purpose} options={purposeOptions} onChange={(purpose) => patch({ purpose })} />
  </WorkspaceDialog>;
}

function ResourceRow({ resource, canManage, onEdit, onRemove }: { resource: StoryResource; canManage: boolean; onEdit: (element: HTMLElement) => void; onRemove: () => void }) {
  const Icon = resourceIcon(resource);
  const available = isHttpUrl(resource.url);
  const body = <>
    <ItemMedia variant="icon" className="text-muted-foreground"><Icon aria-hidden="true" /></ItemMedia>
    <ItemContent><ItemTitle>{resource.label}</ItemTitle><ItemDescription>{available ? resourceSubtitle(resource) : "Link unavailable"}</ItemDescription></ItemContent>
    {available ? <ItemActions><ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></ItemActions> : null}
  </>;
  return <div className="flex items-center gap-1 pr-1.5">
    {available
      ? <Item size="sm" className="min-w-0 flex-1" render={<a href={resource.url} target="_blank" rel="noopener noreferrer" />}>{body}</Item>
      : <Item size="sm" className="min-w-0 flex-1">{body}</Item>}
    {canManage ? <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${resource.label}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={(event) => onEdit(event.currentTarget as HTMLElement)}><Pencil aria-hidden="true" />Edit link</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onRemove}><Trash2 aria-hidden="true" />Remove link</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu> : null}
  </div>;
}

export function ResourcesSection() {
  const { storyId, client, data, caps, reload, sectionError, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const dialog = useDialogTarget<StoryResource>("[data-ws-add=link]");
  const failed = sectionError("resources");
  const canManage = caps.manageResources && !failed;

  const remove = useMutation({
    mutationFn: (id: string) => client.removeResource(storyId, id),
    onMutate: async (id) => {
      await cache.cancel();
      const previous = cache.read()?.resources ?? [];
      cache.write((current) => applyResources(current, (current?.resources ?? []).filter((resource) => resource.id !== id)));
      return { previous };
    },
    onSuccess: (response) => { cache.write((current) => applyResources(current, response.resources)); announce("Link removed."); toast.success("Link removed."); },
    onError: (failure, _id, context) => {
      cache.write((current) => applyResources(current, context?.previous ?? []));
      toast.error(workspaceError(failure, "The link couldn't be removed. Try again.").message);
    },
    onSettled: () => { void cache.invalidate(); }
  });

  const add = canManage ? <AddButton data-ws-add="link" onClick={(event) => dialog.openWith(null, event.currentTarget)}>Add link</AddButton> : null;
  return <Panel id="ws-files" title="Files & Links" className="order-1 @3xl/ws:order-none" action={data.resources.length ? add : null} contentClassName="px-0">
    {failed ? <SectionFailed what="links" onRetry={() => void reload()} /> : data.resources.length
      ? <ItemList>{data.resources.map((resource) => <ResourceRow key={resource.id} resource={resource} canManage={canManage} onEdit={(element) => dialog.openWith(resource, element)} onRemove={() => remove.mutate(resource.id)} />)}</ItemList>
      : <div className="px-3"><EmptyState title="No files or links yet." description={canManage ? "Link the working draft, notes and research." : undefined}>{add}</EmptyState></div>}
    <LinkDialog key={`link-${dialog.session}`} open={dialog.open} resource={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Panel>;
}
