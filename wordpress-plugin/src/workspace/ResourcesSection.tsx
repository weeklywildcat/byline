import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../home/ui/button";
import { AddButton, FieldFrame, InlineError, Note, SectionFailed, SectionHeading, SelectField, TextField } from "./fields";
import { RESOURCE_PURPOSE_LABELS } from "./reporting-model";
import { isHttpUrl, normalizePurpose, resourceSubtitle, validateLink } from "./resource-model";
import { applyResources } from "./workspace-cache";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { workspaceError } from "./workspace-errors";
import { RESOURCE_PURPOSES, type ResourcePurpose, type StoryResource } from "./workspace-types";

const purposeOptions = RESOURCE_PURPOSES.map((value) => ({ value, label: RESOURCE_PURPOSE_LABELS[value] }));

type LinkDraft = { label: string; url: string; purpose: ResourcePurpose };

function LinkForm({ initial, pending, error, onSubmit, onCancel, onRemove, submitLabel }: { initial: LinkDraft; pending: boolean; error: string; onSubmit: (draft: LinkDraft) => void; onCancel: () => void; onRemove?: () => void; submitLabel: string }) {
  const [draft, setDraft] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateLink(draft) : {};
  return <form className="ws-inline-form" noValidate onSubmit={(event) => { event.preventDefault(); setAttempted(true); if (Object.keys(validateLink(draft)).length === 0 && !pending) onSubmit({ ...draft, label: draft.label.trim(), url: draft.url.trim() }); }}>
    <TextField label="Label" value={draft.label} onChange={(label) => setDraft({ ...draft, label })} error={errors.label} maxLength={120} autoFocus placeholder="Interview notes" />
    <TextField label="Link" value={draft.url} onChange={(url) => setDraft({ ...draft, url })} error={errors.url} maxLength={2048} placeholder="https://…" />
    <SelectField label="What is it?" value={draft.purpose} options={purposeOptions} onChange={(purpose) => setDraft({ ...draft, purpose })} />
    {error ? <InlineError>{error}</InlineError> : null}
    <div className="ws-inline-actions">
      {onRemove ? <Button type="button" variant="ghost" className="ws-delete" onClick={onRemove} disabled={pending}>Remove</Button> : null}
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
    </div>
  </form>;
}

export function ResourcesSection() {
  const { storyId, client, data, caps, reload, sectionError, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const failed = sectionError("resources");
  const canManage = caps.manageResources && !failed;

  const close = () => { setAdding(false); setEditing(null); setError(""); };
  const saved = (message: string) => ({
    onSuccess: (response: { resources: StoryResource[] }) => { cache.write((current) => applyResources(current, response.resources)); announce(message); close(); },
    onError: (failure: unknown) => setError(workspaceError(failure, "The link couldn't be saved. Try again.").message),
    onSettled: () => { void cache.invalidate(); }
  });
  const add = useMutation({ mutationFn: (draft: LinkDraft) => client.addResource(storyId, draft), ...saved("Link added.") });
  const update = useMutation({ mutationFn: ({ id, draft }: { id: string; draft: LinkDraft }) => client.updateResource(storyId, id, draft), ...saved("Link saved.") });
  const remove = useMutation({
    mutationFn: (id: string) => client.removeResource(storyId, id),
    onMutate: async (id) => {
      await cache.cancel();
      const previous = cache.read()?.resources ?? [];
      cache.write((current) => applyResources(current, (current?.resources ?? []).filter((resource) => resource.id !== id)));
      setEditing(null);
      return { previous };
    },
    onSuccess: (response) => { cache.write((current) => applyResources(current, response.resources)); announce("Link removed."); },
    onError: (failure, _id, context) => {
      cache.write((current) => applyResources(current, context?.previous ?? []));
      toast.error(workspaceError(failure, "The link couldn't be removed. Try again.").message);
    },
    onSettled: () => { void cache.invalidate(); }
  });
  const pending = add.isPending || update.isPending;

  return <section aria-labelledby="ws-files" className="ws-section ws-files-section">
    <SectionHeading id="ws-files" title="Files & Links">{canManage && !adding ? <AddButton data-ws-add="link" onClick={() => { setEditing(null); setError(""); setAdding(true); }}>Add link</AddButton> : null}</SectionHeading>
    {failed ? <SectionFailed what="links" onRetry={() => void reload()} /> : <>
      {data.resources.length ? <ul className="ws-rows ws-links">{data.resources.map((resource) => editing === resource.id
        ? <li key={resource.id}><LinkForm initial={{ label: resource.label, url: resource.url, purpose: normalizePurpose(resource.purpose) }} pending={pending} error={error} submitLabel="Save link" onCancel={close} onSubmit={(draft) => update.mutate({ id: resource.id, draft })} onRemove={() => remove.mutate(resource.id)} /></li>
        : <li key={resource.id} className="ws-link">
          {isHttpUrl(resource.url)
            ? <a className="ws-row ws-link-main" href={resource.url} target="_blank" rel="noopener noreferrer"><span className="ws-row-main"><span className="ws-row-title">{resource.label}</span><span className="ws-row-sub">{resourceSubtitle(resource)}</span></span><ArrowUpRight className="ws-row-chevron" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>
            : <span className="ws-row ws-link-main"><span className="ws-row-main"><span className="ws-row-title">{resource.label}</span><span className="ws-row-sub">Link unavailable</span></span></span>}
          {canManage ? <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${resource.label}`} onClick={() => { setAdding(false); setError(""); setEditing(resource.id); }}><Pencil aria-hidden="true" /></Button> : null}
        </li>)}</ul> : !adding ? <Note>No files or links yet.</Note> : null}
      {adding ? <LinkForm initial={{ label: "", url: "", purpose: "other" }} pending={pending} error={error} submitLabel="Add link" onCancel={close} onSubmit={(draft) => add.mutate(draft)} /> : null}
    </>}
  </section>;
}
