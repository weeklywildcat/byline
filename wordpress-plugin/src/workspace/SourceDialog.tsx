import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "../home/ui/button";
import { WorkspaceDialog } from "./dialog-shell";
import { PeoplePicker, SelectField, TextAreaField, TextField } from "./fields";
import { SOURCE_NOTES_MAX, SOURCE_STATUS_LABELS, emptySourceForm, sourceFormToInput, sourceToForm, validateSourceForm, type SourceForm } from "./reporting-model";
import { peopleOptions } from "./workspace-model";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { applyReporting } from "./workspace-cache";
import { workspaceError } from "./workspace-errors";
import { SOURCE_STATUSES, type StorySource } from "./workspace-types";

const statusOptions = SOURCE_STATUSES.map((value) => ({ value, label: SOURCE_STATUS_LABELS[value] }));

export type SourceDialogProps = { open: boolean; source: StorySource | null; onClose: () => void; finalFocus: () => HTMLElement | null };

/** A story-scoped reporting target: a label, who they are, where we are with them, and who is on it. No contact details. */
export function SourceDialog({ open, source, onClose, finalFocus }: SourceDialogProps) {
  const { storyId, client, data, reload } = useWorkspace();
  const cache = useWorkspaceCache();
  const [form, setForm] = useState<SourceForm>(() => (source ? sourceToForm(source) : emptySourceForm()));
  const [attempted, setAttempted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<ReturnType<typeof workspaceError> | null>(null);
  const errors = attempted ? validateSourceForm(form) : {};
  const people = peopleOptions(data.people, source?.assignees);
  const patch = (changes: Partial<SourceForm>) => setForm((current) => ({ ...current, ...changes }));

  const done = (message: string) => ({
    onSuccess: (response: Parameters<typeof applyReporting>[1]) => { cache.write((current) => applyReporting(current, response)); toast.success(message); onClose(); },
    onError: (failure: unknown) => setError(workspaceError(failure, "The source couldn't be saved. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });
  const save = useMutation({ mutationFn: () => client.saveSource(storyId, sourceFormToInput(form, source ?? undefined), source?.id), ...done(source ? "Source saved." : "Source added.") });
  const remove = useMutation({ mutationFn: () => client.deleteSource(storyId, source!.id), ...done("Source removed.") });
  const pending = save.isPending || remove.isPending;

  const reloadAndClose = async () => { await reload(); onClose(); };
  const submit = () => {
    setAttempted(true);
    setError(null);
    if (Object.keys(validateSourceForm(form)).length === 0) save.mutate();
  };

  return <WorkspaceDialog open={open} onClose={onClose} finalFocus={finalFocus} title={source ? "Edit source" : "Add source"} description="Who you plan to talk to for this story. No contact details are kept here." submitLabel={source ? "Save source" : "Add source"} pending={pending} error={error?.message} onReload={error?.conflict ? () => void reloadAndClose() : undefined} onSubmit={submit}
    secondary={source ? (confirmDelete
      ? <div className="ws-confirm" role="group" aria-label="Confirm removing this source"><span>Remove this source? Linked appointments stay.</span><Button type="button" variant="destructive" disabled={pending} onClick={() => { setError(null); remove.mutate(); }}>{remove.isPending ? "Removing…" : "Remove"}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(false)}>Keep</Button></div>
      : <Button type="button" variant="ghost" className="ws-delete" disabled={pending} onClick={() => setConfirmDelete(true)}>Remove source</Button>) : null}>
    <TextField label="Label" value={form.label} onChange={(label) => patch({ label })} error={errors.label} maxLength={120} autoFocus placeholder="Mrs. Hamby, or a role like “Athletic director”" />
    <div className="ws-form-row">
      <TextField label="Role" value={form.role} onChange={(role) => patch({ role })} maxLength={120} optional />
      <TextField label="Organization" value={form.organization} onChange={(organization) => patch({ organization })} maxLength={120} optional />
    </div>
    <SelectField label="Status" value={form.status} options={statusOptions} onChange={(status) => patch({ status })} />
    <PeoplePicker label="Assigned to" options={people} value={form.assigneeIds} onChange={(assigneeIds) => patch({ assigneeIds })} error={errors.assignees} />
    <TextAreaField label="Notes" value={form.notes} onChange={(notes) => patch({ notes })} maxLength={SOURCE_NOTES_MAX} error={errors.notes} optional hint="Internal. Not article copy." />
  </WorkspaceDialog>;
}
