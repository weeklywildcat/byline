import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormField, SelectField, TextAreaField, TextField, describedBy } from "../admin-ui/components/form-fields";
import { Button } from "../admin-ui/ui/button";
import { ButtonGroup } from "../admin-ui/ui/button-group";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "../admin-ui/ui/combobox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { RadioGroup, RadioGroupItem } from "../admin-ui/ui/radio-group";
import { RemoveControl, WorkspaceDialog, focusFirstInvalidField } from "./dialog-shell";
import { DayField, DayRangeField, PeoplePicker } from "./fields";
import { appointmentFormToInput, appointmentToForm, applyQuickWindow, emptyAppointmentForm, isValid, setExactDate, setScheduleMode, validateAppointmentForm, type AppointmentForm } from "./appointment-form";
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_NOTES_MAX, APPOINTMENT_STATUS_LABELS } from "./reporting-model";
import { formatLongDay, peopleOptions } from "./workspace-model";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { applyReporting } from "./workspace-cache";
import { workspaceError } from "./workspace-errors";
import { workspaceUndoToast, workspaceToast } from "./workspace-toast";
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES, type ReportingResponse, type ScheduleMode, type StoryAppointment, type StorySource } from "./workspace-types";

const kindOptions = APPOINTMENT_KINDS.map((value) => ({ value, label: APPOINTMENT_KIND_LABELS[value] }));
const statusOptions = APPOINTMENT_STATUSES.map((value) => ({ value, label: APPOINTMENT_STATUS_LABELS[value] }));
const modeOptions: Array<{ value: ScheduleMode; label: string; description: string }> = [
  { value: "unscheduled", label: "Not scheduled", description: "We haven't arranged a date yet." },
  { value: "window", label: "Target date range", description: "We know roughly when it should happen." },
  { value: "exact", label: "Exact date & time", description: "The appointment has been scheduled." }
];

/** Start and end as two time inputs under one label: "10:15 AM — 10:35 AM". */
function TimeRange({ start, end, onStart, onEnd, startError, endError }: { start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void; startError?: string; endError?: string }) {
  const id = useId();
  const error = startError || endError;
  return <FormField id={`${id}-start`} label="Time" error={error}>
    <div className="flex items-center gap-2">
      <Input id={`${id}-start`} type="time" aria-label="Start time" value={start} onChange={(event) => onStart(event.target.value)} aria-invalid={startError ? true : undefined} aria-describedby={describedBy(`${id}-start`, error)} />
      <span aria-hidden="true" className="text-muted-foreground">—</span>
      <Input type="time" aria-label="End time (optional)" value={end} onChange={(event) => onEnd(event.target.value)} aria-invalid={endError ? true : undefined} aria-describedby={describedBy(`${id}-start`, error)} />
    </div>
  </FormField>;
}

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
 * Scheduling for one appointment. "Not scheduled", "Target date range" and
 * "Exact date & time" are mutually exclusive: choosing one clears the others' fields, and
 * only the chosen mode's fields are ever sent.
 */
export function AppointmentDialog({ open, appointment, initial, onClose, finalFocus }: AppointmentDialogProps) {
  const { storyId, client, data, timezone, currentUserId, reload } = useWorkspace();
  const cache = useWorkspaceCache();
  const initialForm = appointment ? appointmentToForm(appointment, timezone) : emptyAppointmentForm({ assigneeIds: currentUserId ? [currentUserId] : [], ...initial });
  const [form, setForm] = useState<AppointmentForm>(() => initialForm);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<ReturnType<typeof workspaceError> | null>(null);
  const errors = attempted ? validateAppointmentForm(form) : {};
  const people = peopleOptions(data.people, appointment?.assignees);
  const patch = (changes: Partial<AppointmentForm>) => setForm((current) => ({ ...current, ...changes }));

  const save = useMutation({
    mutationFn: () => client.saveAppointment(storyId, appointmentFormToInput(form, appointment ?? undefined, timezone), appointment?.id),
    onSuccess: (response: ReportingResponse) => {
      cache.write((current) => applyReporting(current, response));
      if (appointment) {
        const updated = response.appointments.find((item) => item.id === appointment.id);
        if (updated) {
          workspaceUndoToast("Appointment saved.", {
            restored: "Appointment restored.",
            failed: "The appointment changed again, so that edit couldn't be undone.",
            undo: async () => {
              const original = appointmentToForm(appointment, timezone);
              const undone = await client.saveAppointment(storyId, appointmentFormToInput(original, updated, timezone), appointment.id);
              cache.write((current) => applyReporting(current, undone));
              await cache.invalidate();
            }
          });
        } else workspaceToast("Appointment saved.");
      } else if (response.appointmentId) {
        workspaceUndoToast("Appointment added.", {
          restored: "Appointment removed.",
          failed: "The new appointment couldn't be removed.",
          undo: async () => {
            const undone = await client.deleteAppointment(storyId, response.appointmentId!);
            cache.write((current) => applyReporting(current, undone));
            await cache.invalidate();
          }
        });
      } else workspaceToast("Appointment added.");
      onClose();
    },
    onError: (failure: unknown) => setError(workspaceError(failure, "The appointment couldn't be saved. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });
  const remove = useMutation({
    mutationFn: () => client.deleteAppointment(storyId, appointment!.id),
    onSuccess: (response: ReportingResponse) => { cache.write((current) => applyReporting(current, response)); workspaceToast("Appointment deleted."); onClose(); },
    onError: (failure: unknown) => setError(workspaceError(failure, "The appointment couldn't be deleted. Try again.")),
    onSettled: () => { void cache.invalidate(); }
  });
  const pending = save.isPending || remove.isPending;
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const submit = () => {
    setAttempted(true);
    setError(null);
    const nextErrors = validateAppointmentForm(form);
    if (isValid(nextErrors)) save.mutate();
    else focusFirstInvalidField();
  };
  const reloadAndClose = async () => { await reload(); onClose(); };
  const differentEndDay = form.mode === "exact" && form.endTime && form.endDate && form.endDate !== form.date;

  return <WorkspaceDialog open={open} onClose={onClose} finalFocus={finalFocus} title={appointment ? "Edit appointment" : "Add appointment"} description="Where and when someone has to be. Leave the schedule open until you know." submitLabel={appointment ? "Save appointment" : "Add appointment"} pending={pending} dirty={dirty} error={error?.message} onReload={error?.conflict ? () => void reloadAndClose() : undefined} onSubmit={submit}
    secondary={appointment ? <RemoveControl label="Delete appointment" title="Delete this appointment?" description="Marking it cancelled instead keeps a record." confirmLabel="Delete" pending={pending} onStart={() => setError(null)} onConfirm={() => remove.mutate()} /> : null}>
    <TextField label="Title" value={form.title} onChange={(title) => patch({ title })} error={errors.title} maxLength={160} autoFocus placeholder="Interview Mrs. Hamby" />
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Type" value={form.kind} options={kindOptions} onChange={(kind) => patch({ kind })} />
      <SelectField label="Status" value={form.status} options={statusOptions} onChange={(status) => patch({ status })} />
    </div>

    <FieldSet>
      <FieldLegend variant="label">When is this happening?</FieldLegend>
      <RadioGroup value={form.mode} onValueChange={(mode) => setForm((current) => setScheduleMode(current, mode as ScheduleMode))}>
        {modeOptions.map((option) => <FieldLabel key={option.value} htmlFor={`ws-schedule-${option.value}`}>
          <Field orientation="horizontal">
            <FieldContent><FieldTitle>{option.label}</FieldTitle><FieldDescription>{option.description}</FieldDescription></FieldContent>
            <RadioGroupItem id={`ws-schedule-${option.value}`} value={option.value} />
          </Field>
        </FieldLabel>)}
      </RadioGroup>
      {form.mode === "window" ? <FieldGroup className="gap-4">
        <ButtonGroup aria-label="Quick target dates">
          <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => applyQuickWindow(current, "this-week", timezone))}>This week</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => applyQuickWindow(current, "next-week", timezone))}>Next week</Button>
        </ButtonGroup>
        <DayRangeField label="Target dates" start={form.windowStart} end={form.windowEnd} onChange={(windowStart, windowEnd) => patch({ windowStart, windowEnd })} error={errors.windowStart || errors.windowEnd} hint="A target range has no time of day. Choose “Exact date & time” when it's set." />
      </FieldGroup> : null}
      {form.mode === "exact" ? <FieldGroup className="gap-4">
        <DayField label="Date" value={form.date} onChange={(date) => setForm((current) => setExactDate(current, date))} error={errors.date} clearable={false} />
        <TimeRange start={form.startTime} end={form.endTime} onStart={(startTime) => patch({ startTime })} onEnd={(endTime) => patch({ endTime })} startError={errors.startTime} endError={errors.endTime} />
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
