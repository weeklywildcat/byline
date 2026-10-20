import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileImage, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { SelectField, TextAreaField, TextField } from "../admin-ui/components/form-fields";
import { AssigneePicker } from "../admin-ui/components/pickers";
import { Button } from "../admin-ui/ui/button";
import { Field, FieldDescription, FieldLabel } from "../admin-ui/ui/field";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "../admin-ui/ui/attachment";
import { RemoveControl, WorkspaceDialog } from "./dialog-shell";
import { DayField } from "./fields";
import { emptyMediaForm, fileCountLabel, mediaFormToInput, mediaToForm, validateMediaForm, type MediaForm } from "./media-form";
import { mediaLibraryAvailable, pickFromMediaLibrary, type PickedAttachment } from "./media-library";
import { MEDIA_STATUS_LABELS, MEDIA_TYPE_LABELS, labelFor } from "./reporting-model";
import { peopleOptions } from "./workspace-model";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { applyMedia } from "./workspace-cache";
import { workspaceError } from "./workspace-errors";
import { MEDIA_ASSIGNMENT_STATUSES, MEDIA_ASSIGNMENT_TYPES, type MediaAssignmentsResponse, type StoryMediaAssignment } from "./workspace-types";

const typeOptions = MEDIA_ASSIGNMENT_TYPES.map((value) => ({ value, label: MEDIA_TYPE_LABELS[value] }));
const statusOptions = MEDIA_ASSIGNMENT_STATUSES.map((value) => ({ value, label: MEDIA_STATUS_LABELS[value] }));

/** One Media Library file linked to the assignment: a native Attachment with its remove action. */
export function FileAttachment({ preview, unavailable, onRemove, disabled }: { preview: PickedAttachment; unavailable: boolean; onRemove: () => void; disabled?: boolean }) {
  const title = unavailable ? "Unavailable file" : preview.title;
  return <Attachment size="sm" state={unavailable ? "error" : "done"} className="w-full">
    <AttachmentMedia variant={preview.previewUrl ? "image" : "icon"}>{preview.previewUrl ? <img src={preview.previewUrl} alt="" loading="lazy" /> : preview.mimeType?.startsWith("image/") ? <FileImage aria-hidden="true" /> : <FileText aria-hidden="true" />}</AttachmentMedia>
    <AttachmentContent><AttachmentTitle>{title}</AttachmentTitle><AttachmentDescription>#{preview.id}{unavailable ? " · can't be read" : ""}</AttachmentDescription></AttachmentContent>
    <AttachmentActions><AttachmentAction type="button" aria-label={`Remove ${unavailable ? `file ${preview.id}` : preview.title}`} disabled={disabled} onClick={onRemove}><X aria-hidden="true" /></AttachmentAction></AttachmentActions>
  </Attachment>;
}

export type MediaDialogProps = { open: boolean; assignment: StoryMediaAssignment | null; onClose: () => void; finalFocus: () => HTMLElement | null };

/**
 * One production assignment. A reporter or editor changes every field; the
 * person it is assigned to changes only status, notes and files, and only
 * those fields are ever sent for them.
 */
export function MediaDialog({ open, assignment, onClose, finalFocus }: MediaDialogProps) {
  const { storyId, client, data, timezone, caps, currentUserId, reload } = useWorkspace();
  const cache = useWorkspaceCache();
  const manage = caps.manageMedia;
  const [form, setForm] = useState<MediaForm>(() => (assignment ? mediaToForm(assignment, timezone) : emptyMediaForm(caps.assignMedia ? 0 : currentUserId)));
  const [previews, setPreviews] = useState<Map<number, PickedAttachment>>(() => new Map((assignment?.attachments || []).map((file) => [file.id, { id: file.id, title: file.title || `File ${file.id}`, previewUrl: file.previewUrl ?? file.url ?? null, mimeType: file.mimeType ?? null }])));
  const [attempted, setAttempted] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<ReturnType<typeof workspaceError> | null>(null);
  const errors = attempted ? validateMediaForm(form) : {};
  const people = peopleOptions(data.people, assignment?.assignee ? [{ id: assignment.assignee.id, name: assignment.assignee.name }] : []);
  const assignee = people.find((person) => Number(person.id) === form.assigneeId) ?? null;
  const patch = (changes: Partial<MediaForm>) => setForm((current) => ({ ...current, ...changes }));
  const invalid = new Set(assignment?.invalidAttachmentIds || []);

  const handlers = (message: string) => ({
    onSuccess: (response: MediaAssignmentsResponse) => { cache.write((current) => applyMedia(current, response)); toast.success(message); onClose(); },
    onError: (failure: unknown) => setError(workspaceError(failure, "The assignment couldn't be saved. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });
  const save = useMutation({ mutationFn: () => client.saveMediaAssignment(storyId, mediaFormToInput(form, assignment ?? undefined, { manage, assign: caps.assignMedia }, timezone), assignment?.id), ...handlers(assignment ? "Assignment saved." : "Assignment added.") });
  const remove = useMutation({ mutationFn: () => client.deleteMediaAssignment(storyId, assignment!.id), ...handlers("Assignment removed.") });
  const pending = save.isPending || remove.isPending;

  const submit = () => {
    setAttempted(true);
    setError(null);
    if (Object.keys(validateMediaForm(form)).length === 0) save.mutate();
  };
  const addFromLibrary = async () => {
    setPicking(true);
    try {
      const picked = await pickFromMediaLibrary(form.type);
      if (picked.length) {
        setPreviews((current) => { const next = new Map(current); picked.forEach((file) => next.set(file.id, file)); return next; });
        setForm((current) => ({ ...current, attachmentIds: Array.from(new Set([...current.attachmentIds, ...picked.map((file) => file.id)])) }));
      }
    } finally {
      setPicking(false);
    }
  };
  const reloadAndClose = async () => { await reload(); onClose(); };
  const assigneeName = assignee?.name || assignment?.assignee?.name || "Unassigned";

  return <WorkspaceDialog open={open} onClose={onClose} finalFocus={finalFocus} modal={!picking} title={assignment ? "Edit assignment" : "Add assignment"} description={manage ? "Photo, graphics, video and audio work for this story." : "You can update the status, notes and files of your assignment."} submitLabel={assignment ? "Save assignment" : "Add assignment"} pending={pending} error={error?.message} onReload={error?.conflict ? () => void reloadAndClose() : undefined} onSubmit={submit}
    secondary={assignment && manage ? <RemoveControl label="Remove assignment" title="Remove this assignment?" description="Files stay in the Media Library." confirmLabel="Remove" pending={pending} onStart={() => setError(null)} onConfirm={() => remove.mutate()} /> : null}>
    {manage ? <>
      <TextField label="Title" value={form.title} onChange={(title) => patch({ title })} error={errors.title} maxLength={160} optional autoFocus placeholder={`${MEDIA_TYPE_LABELS[form.type]} for this story`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" value={form.type} options={typeOptions} onChange={(type) => patch({ type })} />
        <SelectField label="Status" value={form.status} options={statusOptions} onChange={(status) => patch({ status })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {caps.assignMedia
          ? <Field><FieldLabel htmlFor="ws-media-assignee">Assigned to <span className="font-normal text-muted-foreground">Optional</span></FieldLabel><AssigneePicker id="ws-media-assignee" people={people} value={assignee} onChange={(person) => patch({ assigneeId: person ? Number(person.id) : 0 })} /></Field>
          : <Field><FieldLabel>Assigned to</FieldLabel><p className="text-sm">{assigneeName}</p></Field>}
        <DayField label="Due" value={form.dueDay} onChange={(dueDay) => patch({ dueDay })} error={errors.dueDay} />
      </div>
    </> : <>
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm [&>dt]:text-muted-foreground">
        <dt>Assignment</dt><dd>{assignment?.title}</dd>
        <dt>Type</dt><dd>{labelFor(MEDIA_TYPE_LABELS, form.type)}</dd>
        <dt>Assigned to</dt><dd>{assigneeName}</dd>
      </dl>
      <SelectField label="Status" value={form.status} options={statusOptions} onChange={(status) => patch({ status })} />
    </>}
    <TextAreaField label="Notes" value={form.notes} onChange={(notes) => patch({ notes })} maxLength={4000} error={errors.notes} optional hint="Internal. Not article copy." />

    <Field>
      <FieldLabel id="ws-media-files-label">Files <span className="font-normal text-muted-foreground">{fileCountLabel(form.attachmentIds.length)}</span></FieldLabel>
      {form.attachmentIds.length ? <AttachmentGroup role="group" aria-labelledby="ws-media-files-label" className="flex-col gap-2 overflow-visible py-0">{form.attachmentIds.map((id) => <FileAttachment key={id} preview={previews.get(id) ?? { id, title: `File ${id}`, previewUrl: null, mimeType: null }} unavailable={invalid.has(id)} disabled={pending} onRemove={() => patch({ attachmentIds: form.attachmentIds.filter((item) => item !== id) })} />)}</AttachmentGroup> : <FieldDescription>No files linked yet.</FieldDescription>}
      {mediaLibraryAvailable() ? <div><Button type="button" variant="outline" size="sm" disabled={pending || picking} onClick={() => void addFromLibrary()}>Add from Media Library</Button></div> : <FieldDescription>Upload files in the Media Library, then link them here.</FieldDescription>}
    </Field>
  </WorkspaceDialog>;
}
