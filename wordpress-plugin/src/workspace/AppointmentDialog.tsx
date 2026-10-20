import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { SelectField, TextAreaField, TextField, TimeField } from "../admin-ui/components/form-fields";
import { Button } from "../admin-ui/ui/button";
import { ButtonGroup } from "../admin-ui/ui/button-group";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "../admin-ui/ui/combobox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../admin-ui/ui/field";
import { ToggleGroup, ToggleGroupItem } from "../admin-ui/ui/toggle-group";
import { RemoveControl, WorkspaceDialog } from "./dialog-shell";
import { DayField, PeoplePicker } from "./fields";
import { appointmentFormToInput, appointmentToForm, applyQuickWindow, emptyAppointmentForm, isValid, setExactDate, setScheduleMode, validateAppointmentForm, type AppointmentForm } from "./appointment-form";
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_NOTES_MAX, APPOINTMENT_STATUS_LABELS } from "./reporting-model";
import { formatLongDay, peopleOptions } from "./workspace-model";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { applyReporting } from "./workspace-cache";
import { workspaceError } from "./workspace-errors";
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES, type ReportingResponse, type ScheduleMode, type StoryAppointment, type StorySource } from "./workspace-types";

const kindOptions = APPOINTMENT_KINDS.map((value) => ({ value, label: APPOINTMENT_KIND_LABELS[value] }));
const statusOptions = APPOINTMENT_STATUSES.map((value) => ({ value, label: APPOINTMENT_STATUS_LABELS[value] }));
const modeOptions: Array<{ value: ScheduleMode; label: string }> = [
  { value: "unscheduled", label: "Not scheduled" },
  { value: "window", label: "Date range" },
  { value: "exact", label: "Exact time" }
];

function SourcePicker({ sources, value, onChange }: { sources: StorySource[]; value: string; onChange: (id: string) => void }) {
  const selected = sources.find((source) => source.id === value) || null;
  return <Field>
    <FieldLabel htmlFor="ws-appointment-source">Linked source <span className="font-normal text-muted-foreground">Optional</span></FieldLabel>
    <Combobox items={sources} value={selected} onValueChange={(source: StorySource | null) => onChange(source?.id || "")} itemToStringLabel={(source: StorySource) => source.label} isItemEqualToValue={(a: StorySource, b: StorySource) => a.id === b.id}>
      <ComboboxInput id="ws-appointment-source" placeholder="No linked source" showClear disabled={!sources.length} />
      <ComboboxContent><ComboboxEmpty>No sources found.</ComboboxEmpty><ComboboxList>{(source: StorySource) => <ComboboxItem key={source.id} value={source}>{source.label}</ComboboxItem>}</ComboboxList></ComboboxContent>
    </Combobox>
    {sources.length ? null : <FieldDescription>Add a source to link it here.</FieldDescription>}
  </Field>;
}

export type AppointmentDialogProps = {
  open: boolean;
  appointment: StoryAppointment | null;
  /** Prefills a new appointment (for example, from a source). */
  initial?: Partial<AppointmentForm>;
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
};

/**
 * Scheduling for one appointment. "Not scheduled", "Date range" and "Exact
 * time" are mutually exclusive: choosing one clears the others' fields, and
 * only the chosen mode's fields are ever sent.
 */
export function AppointmentDialog({ open, appointment, initial, onClose, finalFocus }: AppointmentDialogProps) {
  const { storyId, client, data, timezone, currentUserId, reload } = useWorkspace();
  const cache = useWorkspaceCache();
  const [form, setForm] = useState<AppointmentForm>(() => (appointment ? appointmentToForm(appointment, timezone) : emptyAppointmentForm({ assigneeIds: currentUserId ? [currentUserId] : [], ...initial })));
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<ReturnType<typeof workspaceError> | null>(null);
  const errors = attempted ? validateAppointmentForm(form) : {};
  const people = peopleOptions(data.people, appointment?.assignees);
  const patch = (changes: Partial<AppointmentForm>) => setForm((current) => ({ ...current, ...changes }));

  const handlers = (message: string) => ({
    onSuccess: (response: ReportingResponse) => { cache.write((current) => applyReporting(current, response)); toast.success(message); onClose(); },
    onError: (failure: unknown) => setError(workspaceError(failure, "The appointment couldn't be saved. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });
  const save = useMutation({ mutationFn: () => client.saveAppointment(storyId, appointmentFormToInput(form, appointment ?? undefined, timezone), appointment?.id), ...handlers(appointment ? "Appointment saved." : "Appointment added.") });
  const remove = useMutation({ mutationFn: () => client.deleteAppointment(storyId, appointment!.id), ...handlers("Appointment deleted.") });
  const pending = save.isPending || remove.isPending;

  const submit = () => {
    setAttempted(true);
    setError(null);
    if (isValid(validateAppointmentForm(form))) save.mutate();
  };
  const reloadAndClose = async () => { await reload(); onClose(); };
  const differentEndDay = form.mode === "exact" && form.endTime && form.endDate && form.endDate !== form.date;

  return <WorkspaceDialog open={open} onClose={onClose} finalFocus={finalFocus} title={appointment ? "Edit appointment" : "Add appointment"} description="Where and when someone has to be. Leave the schedule open until you know." submitLabel={appointment ? "Save appointment" : "Add appointment"} pending={pending} error={error?.message} onReload={error?.conflict ? () => void reloadAndClose() : undefined} onSubmit={submit}
    secondary={appointment ? <RemoveControl label="Delete appointment" prompt="Delete this appointment? Marking it cancelled keeps a record." confirmLabel="Delete" pendingLabel="Deleting…" pending={pending} removing={remove.isPending} onStart={() => setError(null)} onConfirm={() => remove.mutate()} /> : null}>
    <TextField label="Title" value={form.title} onChange={(title) => patch({ title })} error={errors.title} maxLength={160} autoFocus placeholder="Interview Mrs. Hamby" />
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Type" value={form.kind} options={kindOptions} onChange={(kind) => patch({ kind })} />
      <SelectField label="Status" value={form.status} options={statusOptions} onChange={(status) => patch({ status })} />
    </div>

    <FieldSet>
      <FieldLegend variant="label">When is this happening?</FieldLegend>
      <ToggleGroup variant="outline" spacing={0} className="w-full" value={[form.mode]} onValueChange={(next) => { const mode = next[0] as ScheduleMode | undefined; if (mode && mode !== form.mode) setForm((current) => setScheduleMode(current, mode)); }}>
        {modeOptions.map((option) => <ToggleGroupItem key={option.value} value={option.value} className="flex-1">{option.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {form.mode === "unscheduled" ? <FieldDescription>No date yet. It will be listed under “To schedule”.</FieldDescription> : null}
      {form.mode === "window" ? <FieldGroup className="gap-4">
        <ButtonGroup aria-label="Quick target dates">
          <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => applyQuickWindow(current, "this-week", timezone))}>This week</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => applyQuickWindow(current, "next-week", timezone))}>Next week</Button>
        </ButtonGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <DayField label="First day" value={form.windowStart} onChange={(windowStart) => patch({ windowStart })} error={errors.windowStart} clearable={false} />
          <DayField label="Last day" optional value={form.windowEnd} onChange={(windowEnd) => patch({ windowEnd })} error={errors.windowEnd} />
        </div>
        <FieldDescription>A target range has no time of day. Switch to “Exact time” when it's set.</FieldDescription>
      </FieldGroup> : null}
      {form.mode === "exact" ? <FieldGroup className="gap-4">
        <DayField label="Date" value={form.date} onChange={(date) => setForm((current) => setExactDate(current, date))} error={errors.date} clearable={false} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeField label="Starts" value={form.startTime} onChange={(startTime) => patch({ startTime })} error={errors.startTime} />
          <TimeField label="Ends" value={form.endTime} onChange={(endTime) => patch({ endTime })} error={errors.endTime} optional />
        </div>
        {differentEndDay ? <FieldDescription>Ends {formatLongDay(form.endDate)}. <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={() => patch({ endDate: form.date })}>Same day</Button></FieldDescription> : null}
        <FieldDescription>Times are in the site's timezone ({timezone.replace(/_/g, " ")}).</FieldDescription>
      </FieldGroup> : null}
    </FieldSet>

    <SourcePicker sources={data.sources} value={form.sourceId} onChange={(sourceId) => patch({ sourceId })} />
    <PeoplePicker label="Assigned to" options={people} value={form.assigneeIds} onChange={(assigneeIds) => patch({ assigneeIds })} error={errors.assignees} />
    <TextField label="Location" value={form.location} onChange={(location) => patch({ location })} maxLength={160} optional placeholder="Main office" />
    <TextAreaField label="Notes" value={form.notes} onChange={(notes) => patch({ notes })} maxLength={APPOINTMENT_NOTES_MAX} error={errors.notes} optional hint="Internal. Not article copy." />
  </WorkspaceDialog>;
}
