import { AdminPortalContext, useAdminPortal } from "../admin-ui/lib/portal";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  TextField,
  TextAreaField,
  SelectField,
} from "../admin-ui/components/form-fields";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";
import { Field, FieldLabel } from "../admin-ui/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../admin-ui/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../admin-ui/ui/alert-dialog";
import { AppointmentTimingFields } from "../workspace/AppointmentDialog";
import {
  appointmentFormToInput,
  appointmentToForm,
  siteWallParts,
  validateAppointmentForm,
} from "../workspace/appointment-form";
import {
  describeEditorialError,
  type ContributorEntry,
} from "../editorial/editorial-model";
import { EntityPicker, StoryOption } from "./collection-ui";
import type { CollectionApi } from "./collection-api";
import {
  edgeChanges,
  interviewStatuses,
  type CollectionDetail,
  type Interview,
} from "./collection-model";
import { interviewAppointment } from "./interview-schedule";
export function InterviewPeek({
  interview,
  detail,
  api,
  people,
  timezone,
  onClose,
  refresh,
}: {
  interview: Interview;
  detail: CollectionDetail;
  api: CollectionApi;
  people: ContributorEntry[];
  timezone: string;
  onClose: () => void;
  refresh: () => Promise<unknown>;
}) {
  const rootPortal = useAdminPortal();
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [storyIds, setStoryIds] = useState(interview.storyIds);
  const [interviewerIds, setInterviewerIds] = useState(
    interview.interviewers.map((person) => person.id),
  );
  const [resourceIds, setResourceIds] = useState(interview.resourceIds);
  const [name, setName] = useState(interview.interviewee);
  const [status, setStatus] = useState(interview.status);
  const [notes, setNotes] = useState(interview.notes);
  const [followUps, setFollowUps] = useState(interview.followUps);
  const [contact, setContact] = useState(interview.privateContact || "");
  const [form, setForm] = useState(() =>
    appointmentToForm(interviewAppointment(interview), timezone),
  );
  const initialCompleted = siteWallParts(interview.completedAt, timezone);
  const [completed, setCompleted] = useState(
    initialCompleted ? `${initialCompleted.date}T${initialCompleted.time}` : "",
  );
  const [attempted, setAttempted] = useState(false);
  const [discard, setDiscard] = useState(false);
  const timingErrors = attempted ? validateAppointmentForm(form) : {};
  const save = useMutation({
    mutationFn: async () => {
      for (const [kind, previous, next] of [
        ["interview-story", interview.storyIds, storyIds],
        [
          "interviewer",
          interview.interviewers.map((person) => person.id),
          interviewerIds,
        ],
        ["recording", interview.resourceIds, resourceIds],
      ] as const) {
        for (const change of edgeChanges(previous, next))
          await api.link(
            interview.collectionId,
            kind,
            change.target,
            change.linked,
            interview.id,
          );
      }
      const timing = appointmentFormToInput(form, undefined, timezone);
      return api.interview(
        interview.collectionId,
        {
          interviewee: name,
          status,
          notes,
          followUps,
          ...(interview.canEditContact ? { privateContact: contact } : {}),
          scheduledAt: timing.startAt || "",
          completedAt: completed,
          scheduleMode: timing.scheduleMode,
          windowStart: timing.windowStart || "",
          windowEnd: timing.windowEnd || "",
          endAt: timing.endAt || "",
          location: timing.location,
          expectedUpdatedAt: interview.updatedAt,
        },
        interview.id,
      );
    },
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const members = people.map((p) => ({
    id: Number(p.id),
    name: p.name,
    imageUrl: p.imageUrl,
  }));
  const disabled = !interview.canEdit || save.isPending;
  const timingSnapshot = ({
    mode,
    windowStart,
    windowEnd,
    date,
    startTime,
    endDate,
    endTime,
    location,
  }: typeof form) => ({
    mode,
    windowStart,
    windowEnd,
    date,
    startTime,
    endDate,
    endTime,
    location,
  });
  const dirty =
    edgeChanges(interview.storyIds, storyIds).length > 0 ||
    edgeChanges(
      interview.interviewers.map((person) => person.id),
      interviewerIds,
    ).length > 0 ||
    edgeChanges(interview.resourceIds, resourceIds).length > 0 ||
    name !== interview.interviewee ||
    status !== interview.status ||
    notes !== interview.notes ||
    followUps !== interview.followUps ||
    contact !== (interview.privateContact || "") ||
    JSON.stringify(timingSnapshot(form)) !==
      JSON.stringify(
        timingSnapshot(
          appointmentToForm(interviewAppointment(interview), timezone),
        ),
      ) ||
    completed !==
      (initialCompleted
        ? `${initialCompleted.date}T${initialCompleted.time}`
        : "");
  const close = () => {
    if (!save.isPending) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  };
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent
          showCloseButton={!save.isPending}
          ref={setPortal}
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          <AdminPortalContext value={portal || rootPortal}>
            <SheetHeader className="border-b pr-12">
              <SheetTitle>{interview.interviewee}</SheetTitle>
              <SheetDescription>
                Shared interview · {detail.collection.name}
              </SheetDescription>
            </SheetHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                setAttempted(true);
                if (
                  name.trim() &&
                  !Object.keys(validateAppointmentForm(form)).length
                )
                  save.mutate();
              }}
            >
              <fieldset
                disabled={disabled}
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
              >
                <TextField
                  label="Interviewee / source"
                  value={name}
                  onChange={setName}
                  maxLength={240}
                  error={
                    attempted && !name.trim()
                      ? "Add an interviewee."
                      : undefined
                  }
                />
                <SelectField
                  label="Interview status"
                  value={status}
                  options={Object.entries(interviewStatuses).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  onChange={(v) => setStatus(v as typeof status)}
                />
                <Field>
                  <FieldLabel>Interviewers</FieldLabel>
                  <EntityPicker
                    label="Interviewers"
                    items={members}
                    selected={members.filter((p) =>
                      interviewerIds.includes(p.id),
                    )}
                    itemLabel={(p) => p.name}
                    disabled={disabled}
                    onChange={(next) =>
                      setInterviewerIds(next.map((item) => item.id))
                    }
                  >
                    {(p) => (
                      <span className="flex items-center gap-2">
                        <PeopleAvatars people={[p]} />
                        {p.name}
                      </span>
                    )}
                  </EntityPicker>
                </Field>
                <AppointmentTimingFields
                  form={form}
                  setForm={setForm}
                  errors={timingErrors}
                  timezone={timezone}
                />
                <TextField
                  label="Location"
                  value={form.location}
                  onChange={(location) => setForm({ ...form, location })}
                  optional
                />
                <TextField
                  label="Completed date / time"
                  type="datetime-local"
                  value={completed}
                  onChange={setCompleted}
                  optional
                />
                <Field>
                  <FieldLabel>Linked stories</FieldLabel>
                  <EntityPicker
                    label="Linked stories"
                    items={detail.stories}
                    selected={detail.stories.filter((s) =>
                      storyIds.includes(s.id),
                    )}
                    itemLabel={(s) => s.title}
                    disabled={disabled}
                    onChange={(next) =>
                      setStoryIds(next.map((item) => item.id))
                    }
                  >
                    {(story) => <StoryOption story={story} />}
                  </EntityPicker>
                </Field>
                <Field>
                  <FieldLabel>Recordings / resources</FieldLabel>
                  <EntityPicker
                    label="Interview resources"
                    items={detail.resources}
                    selected={detail.resources.filter((r) =>
                      resourceIds.includes(r.id),
                    )}
                    itemLabel={(r) => r.label}
                    disabled={disabled}
                    onChange={(next) =>
                      setResourceIds(next.map((item) => item.id))
                    }
                  >
                    {(r) => (
                      <>
                        {r.label} · {r.kind}
                      </>
                    )}
                  </EntityPicker>
                  {detail.resources
                    .filter((r) => resourceIds.includes(r.id))
                    .map((r) => (
                      <a
                        key={r.id}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm underline"
                      >
                        {r.label} ↗
                      </a>
                    ))}
                </Field>
                <TextAreaField
                  label="Notes"
                  value={notes}
                  onChange={setNotes}
                  maxLength={2000}
                />
                <TextAreaField
                  label="Follow-ups"
                  value={followUps}
                  onChange={setFollowUps}
                  maxLength={2000}
                />
                {interview.privateContact !== undefined ? (
                  <fieldset disabled={!interview.canEditContact}>
                    <TextAreaField
                      label="Private source details"
                      value={contact}
                      onChange={setContact}
                      maxLength={2000}
                      hint="Visible only to editors and this Collection’s team."
                    />
                  </fieldset>
                ) : null}
                {save.isError ? (
                  <InlineAlert>
                    {describeEditorialError(save.error)}
                  </InlineAlert>
                ) : null}
              </fieldset>
              <SheetFooter className="flex-row justify-end border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={save.isPending}
                >
                  Close
                </Button>
                {interview.canEdit ? (
                  <Button type="submit" disabled={disabled}>
                    {save.isPending ? "Saving…" : "Save interview"}
                  </Button>
                ) : null}
              </SheetFooter>
            </form>
          </AdminPortalContext>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard unsaved interview changes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your reporting edits haven’t been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
