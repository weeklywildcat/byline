import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SelectField, TextField } from "../admin-ui/components/form-fields";
import { ResourceIcon } from "../admin-ui/components/resource-icon";
import { Button } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "../admin-ui/ui/context-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
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
  const trigger = useRef<HTMLButtonElement | null>(null);
  const available = isHttpUrl(resource.url);
  const body = <>
    <ItemMedia variant="icon" className="text-muted-foreground"><ResourceIcon resource={resource} /></ItemMedia>
    <ItemContent><ItemTitle>{resource.label}</ItemTitle><ItemDescription>{available ? resourceSubtitle(resource) : "Link unavailable"}</ItemDescription></ItemContent>
    {available ? <ItemActions><ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></ItemActions> : null}
  </>;
  return <ContextMenu>
    <ContextMenuTrigger render={<div className="flex items-center gap-1 pr-1.5" />}>
      {available
        ? <Item size="sm" className="min-w-0 flex-1" render={<a href={resource.url} target="_blank" rel="noopener noreferrer" />}>{body}</Item>
        : <Item size="sm" className="min-w-0 flex-1">{body}</Item>}
      {canManage ? <DropdownMenu>
        <DropdownMenuTrigger render={<Button ref={trigger} type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${resource.label}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(resource.url).then(() => toast.success("Link copied.")).catch(() => toast.error("The link couldn’t be copied.")); }}><Copy aria-hidden="true" />Copy link</DropdownMenuItem>
          <DropdownMenuItem onClick={(event) => onEdit(event.currentTarget as HTMLElement)}><Pencil aria-hidden="true" />Edit link</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onRemove}><Trash2 aria-hidden="true" />Remove link</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </ContextMenuTrigger>
    <ContextMenuContent className="w-48">
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-44 truncate">{resource.label}</ContextMenuLabel>
        <ContextMenuSeparator />
        {available ? <>
          <ContextMenuItem render={<a href={resource.url} target="_blank" rel="noopener noreferrer" />}><ExternalLink aria-hidden="true" />Open link</ContextMenuItem>
          <ContextMenuItem onClick={() => { void navigator.clipboard.writeText(resource.url).then(() => toast.success("Link copied.")).catch(() => toast.error("The link couldn’t be copied.")); }}><Copy aria-hidden="true" />Copy link</ContextMenuItem>
        </> : null}
        {canManage ? <>
          <ContextMenuItem onClick={(event) => onEdit(event.currentTarget as HTMLElement)}><Pencil aria-hidden="true" />Edit link</ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={onRemove}><Trash2 aria-hidden="true" />Remove link</ContextMenuItem>
        </> : null}
      </ContextMenuGroup>
    </ContextMenuContent>
  </ContextMenu>;
}

export function ResourcesSection() {
  const { storyId, client, data, caps, reload, sectionError, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const dialog = useDialogTarget<StoryResource>("[data-ws-add=link]");
  const failed = sectionError("resources");
  const canManage = caps.manageResources && !failed;

  const remove = useMutation({
    mutationFn: (resource: StoryResource) => client.removeResource(storyId, resource.id),
    onMutate: async (resource) => {
      await cache.cancel();
      const previous = cache.read()?.resources ?? [];
      cache.write((current) => applyResources(current, (current?.resources ?? []).filter((item) => item.id !== resource.id)));
      return { previous };
    },
    onSuccess: (response, resource) => {
      cache.write((current) => applyResources(current, response.resources));
      announce("Link removed.");
      toast.success("Link removed.", { action: { label: "Undo", onClick: () => { void client.addResource(storyId, { label: resource.label, url: resource.url, purpose: resource.purpose }).then((restored) => { cache.write((current) => applyResources(current, restored.resources)); announce("Link restored."); void cache.invalidate(); }).catch((failure) => toast.error(workspaceError(failure, "The link couldn't be restored.").message)); } } });
    },
    onError: (failure, _resource, context) => {
      cache.write((current) => applyResources(current, context?.previous ?? []));
      toast.error(workspaceError(failure, "The link couldn't be removed. Try again.").message);
    },
    onSettled: () => { void cache.invalidate(); }
  });

  const add = canManage ? <AddButton data-ws-add="link" onClick={(event) => dialog.openWith(null, event.currentTarget)}>Add link</AddButton> : null;
  return <Card size="sm" role="region" aria-labelledby="ws-files-title" id="ws-files" className="order-1 lg:order-none">
    <CardHeader>
      <CardTitle id="ws-files-title" role="heading" aria-level={2}>Files &amp; Links</CardTitle>
      {data.resources.length && add ? <CardAction>{add}</CardAction> : null}
    </CardHeader>
    <CardContent className="px-0">
      {failed ? <div className="px-3"><SectionFailed what="links" onRetry={() => void reload()} /></div> : data.resources.length
        ? <ItemGroup role="group" aria-label="Links" className="gap-0">{data.resources.map((resource) => <ResourceRow key={resource.id} resource={resource} canManage={canManage} onEdit={(element) => dialog.openWith(resource, element)} onRemove={() => remove.mutate(resource)} />)}</ItemGroup>
        : <div className="px-3"><Empty className="py-5"><EmptyHeader><EmptyTitle>No files or links yet.</EmptyTitle>{canManage ? <EmptyDescription>Link the working draft, notes and research.</EmptyDescription> : null}</EmptyHeader>{add ? <EmptyContent>{add}</EmptyContent> : null}</Empty></div>}
    </CardContent>
    <LinkDialog key={`link-${dialog.session}`} open={dialog.open} resource={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Card>;
}
