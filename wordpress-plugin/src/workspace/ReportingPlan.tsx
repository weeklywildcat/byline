import { useEffect, useRef, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Pencil } from "lucide-react";
import { ItemButton } from "../admin-ui/components/item-button";
import { PeopleAvatars, anyPicture, type AvatarPerson } from "../admin-ui/components/people-avatars";
import { WorkStatusBadge, sourceIntensity, appointmentIntensity, appointmentStatusLabel, appointmentKind } from "../admin-ui/components/work-status-badge";
import { Button } from "../admin-ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../admin-ui/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "../admin-ui/ui/context-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { AppointmentDialog } from "./AppointmentDialog";
import { SourceDialog } from "./SourceDialog";
import { AddButton, SectionFailed } from "./parts";
import { useDialogTarget } from "./dialog-target";
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUS_LABELS, SOURCE_STATUS_LABELS, labelFor, sourceTimingLine } from "./reporting-model";
import { appointmentTiming, formatDay, formatTime, formatTimeRange, splitAppointments } from "./schedule-model";
import { assigneeAvatars } from "./workspace-model";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { applyReporting } from "./workspace-cache";
import { workspaceError } from "./workspace-errors";
import { APPOINTMENT_STATUSES, SOURCE_STATUSES, type AppointmentStatus, type SourceStatus, type StoryAppointment, type StorySource } from "./workspace-types";

type Open = (element: HTMLElement) => void;
const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

function QuickStatusContext({ title, current, options, disabled, onOpen, onStatus, children }: { title: string; current: string; options: Array<{ value: string; label: string }>; disabled?: boolean; onOpen: Open; onStatus?: (value: string) => void; children: ReactNode }) {
  return <ContextMenu>
    <ContextMenuTrigger render={<div className="contents" />}>{children}</ContextMenuTrigger>
    <ContextMenuContent className="w-52">
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-48 truncate">{title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={(event) => onOpen(event.currentTarget as HTMLElement)}><Pencil aria-hidden="true" />Edit</ContextMenuItem>
        {onStatus ? <ContextMenuSub>
          <ContextMenuSubTrigger disabled={disabled}>Status</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            <ContextMenuRadioGroup value={current} onValueChange={(value) => { if (value && value !== current) onStatus(String(value)); }}>
              {options.map((option) => <ContextMenuRadioItem key={option.value} value={option.value}>{option.label}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub> : null}
      </ContextMenuGroup>
    </ContextMenuContent>
  </ContextMenu>;
}

const SOURCE_STATUS_OPTIONS = SOURCE_STATUSES.map((value) => ({ value, label: SOURCE_STATUS_LABELS[value] }));
const APPOINTMENT_STATUS_OPTIONS = APPOINTMENT_STATUSES.map((value) => ({ value, label: APPOINTMENT_STATUS_LABELS[value] }));

function SourceRow({ source, people, timing, onOpen, onStatus, busy }: { source: StorySource; people: AvatarPerson[]; timing: string; onOpen: Open; onStatus?: (status: SourceStatus) => void; busy?: boolean }) {
  const detail = [source.role, source.organization].filter(Boolean).join(" · ");
  return <QuickStatusContext title={source.label} current={source.status} options={SOURCE_STATUS_OPTIONS} disabled={busy} onOpen={onOpen} onStatus={onStatus ? (value) => onStatus(value as SourceStatus) : undefined}><ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    {anyPicture(people) ? <ItemMedia><PeopleAvatars people={people} /></ItemMedia> : null}
    <ItemContent>
      <ItemTitle>{source.label}</ItemTitle>
      <ItemDescription>{detail}{people.length ? null : <>{detail ? " · " : ""}Unassigned</>}</ItemDescription>
      {timing ? <ItemDescription>{timing}</ItemDescription> : null}
    </ItemContent>
    <ItemActions><WorkStatusBadge kind="reporting" intensity={sourceIntensity(source.status)}>{SOURCE_STATUS_LABELS[source.status]}</WorkStatusBadge><Chevron /></ItemActions>
  </ItemButton></QuickStatusContext>;
}

function AppointmentBadge({ appointment }: { appointment: StoryAppointment }) {
  const kind = labelFor(APPOINTMENT_KIND_LABELS, appointment.kind);
  return <WorkStatusBadge kind={appointmentKind(appointment)} intensity={appointmentIntensity(appointment)}>
    {kind} {appointmentStatusLabel(appointment).toLowerCase()}
  </WorkStatusBadge>;
}

function appointmentSub(appointment: StoryAppointment, withStatus: boolean) {
  const parts = [appointment.location, appointment.sourceLabel && !appointment.title.includes(appointment.sourceLabel) ? appointment.sourceLabel : ""];
  if (appointment.status === "tentative" || withStatus) parts.push(labelFor(APPOINTMENT_STATUS_LABELS, appointment.status));
  return parts.filter(Boolean).join(" · ");
}

function ExactRow({ appointment, people, timezone, onOpen, onStatus, busy }: { appointment: StoryAppointment; people: AvatarPerson[]; timezone: string; onOpen: Open; onStatus?: (status: AppointmentStatus) => void; busy?: boolean }) {
  const range = formatTimeRange(appointment.startAt!, appointment.endAt, timezone);
  return <QuickStatusContext title={appointment.title} current={appointment.status} options={APPOINTMENT_STATUS_OPTIONS} disabled={busy} onOpen={onOpen} onStatus={onStatus ? (value) => onStatus(value as AppointmentStatus) : undefined}><ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemMedia className="w-[4.5rem] justify-start text-sm font-medium whitespace-nowrap tabular-nums"><span aria-hidden="true">{formatTime(appointment.startAt!, timezone)}</span><span className="sr-only">{range}</span></ItemMedia>
    <ItemContent><ItemTitle>{appointment.title}</ItemTitle><ItemDescription>{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</ItemDescription></ItemContent>
    <ItemActions><AppointmentBadge appointment={appointment} /><PeopleAvatars people={people} /><Chevron /></ItemActions>
  </ItemButton></QuickStatusContext>;
}

function ToScheduleRow({ appointment, people, timezone, onOpen, onStatus, busy }: { appointment: StoryAppointment; people: AvatarPerson[]; timezone: string; onOpen: Open; onStatus?: (status: AppointmentStatus) => void; busy?: boolean }) {
  // Never a time here: only a target range, or honestly "Not scheduled".
  const { primary } = appointmentTiming(appointment, timezone);
  return <QuickStatusContext title={appointment.title} current={appointment.status} options={APPOINTMENT_STATUS_OPTIONS} disabled={busy} onOpen={onOpen} onStatus={onStatus ? (value) => onStatus(value as AppointmentStatus) : undefined}><ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent><ItemTitle>{appointment.title}</ItemTitle><ItemDescription>{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</ItemDescription></ItemContent>
    <ItemActions><span className="text-xs text-muted-foreground">{primary}</span><AppointmentBadge appointment={appointment} /><PeopleAvatars people={people} /><Chevron /></ItemActions>
  </ItemButton></QuickStatusContext>;
}

function PastRow({ appointment, people, timezone, onOpen, onStatus, busy }: { appointment: StoryAppointment; people: AvatarPerson[]; timezone: string; onOpen: Open; onStatus?: (status: AppointmentStatus) => void; busy?: boolean }) {
  const timing = appointment.scheduleMode === "unscheduled" ? "" : appointmentTiming(appointment, timezone).primary;
  return <QuickStatusContext title={appointment.title} current={appointment.status} options={APPOINTMENT_STATUS_OPTIONS} disabled={busy} onOpen={onOpen} onStatus={onStatus ? (value) => onStatus(value as AppointmentStatus) : undefined}><ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent><ItemTitle className="text-muted-foreground">{appointment.title}</ItemTitle><ItemDescription>{[labelFor(APPOINTMENT_STATUS_LABELS, appointment.status), timing].filter(Boolean).join(" · ")}</ItemDescription></ItemContent>
    <ItemActions><PeopleAvatars people={people} /><Chevron /></ItemActions>
  </ItemButton></QuickStatusContext>;
}

/** A group heading inside the card: Item's own header row, label left, action right. */
function GroupHeading({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return <Item size="xs" className="py-1"><ItemHeader><ItemTitle id={id} role="heading" aria-level={3}>{title}</ItemTitle>{action ? <ItemActions>{action}</ItemActions> : null}</ItemHeader></Item>;
}

export function ReportingPlan() {
  const { storyId, client, data, timezone, caps, appointmentId, reload, sectionError, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const sourceDialog = useDialogTarget<StorySource>("[data-ws-add=source]");
  const appointmentDialog = useDialogTarget<StoryAppointment>("[data-ws-add=appointment]");
  const deepLinked = useRef(false);
  const failed = sectionError("reporting");
  const { days, toSchedule, past } = splitAppointments(data.appointments, timezone);
  const quickStatus = useMutation({
    mutationFn: ({ kind, id, status, updatedAt }: { kind: "source" | "appointment"; id: string; status: SourceStatus | AppointmentStatus; updatedAt: string }) => kind === "source"
      ? client.saveSource(storyId, { status: status as SourceStatus, expectedUpdatedAt: updatedAt }, id)
      : client.saveAppointment(storyId, { status: status as AppointmentStatus, expectedUpdatedAt: updatedAt }, id),
    onMutate: async ({ kind, id, status }) => {
      await cache.cancel();
      const previous = cache.read();
      cache.write((current) => current ? {
        ...current,
        sources: kind === "source" ? current.sources.map((source) => source.id === id ? { ...source, status: status as SourceStatus } : source) : current.sources,
        appointments: kind === "appointment" ? current.appointments.map((appointment) => appointment.id === id ? { ...appointment, status: status as AppointmentStatus } : appointment) : current.appointments
      } : current);
      return { previous };
    },
    onSuccess: (response, variables) => { cache.write((current) => applyReporting(current, response)); announce(`${variables.kind === "source" ? "Source" : "Appointment"} status updated.`); },
    onError: (failure, _variables, context) => { if (context?.previous) cache.write(() => context.previous); const message = workspaceError(failure, "Status couldn’t be saved. Try again.").message; toast.error(message); announce(message); },
    onSettled: () => { void cache.invalidate(); }
  });
  const statusBusy = (id: string) => quickStatus.isPending && quickStatus.variables?.id === id;

  // A link from Home or Calendar can name an appointment: open it once.
  useEffect(() => {
    if (!appointmentId || deepLinked.current || failed) return;
    deepLinked.current = true;
    const match = data.appointments.find((appointment) => appointment.id === appointmentId);
    if (match) appointmentDialog.openWith(match);
    else toast("That appointment isn't on this story any more.");
  }, [appointmentId, failed, data.appointments]);

  const addSource = caps.addSource ? <AddButton data-ws-add="source" onClick={(event) => sourceDialog.openWith(null, event.currentTarget)}>Add source</AddButton> : null;
  const addAppointment = caps.addAppointment ? <AddButton data-ws-add="appointment" onClick={(event) => appointmentDialog.openWith(null, event.currentTarget)}>Add appointment</AddButton> : null;
  const noAppointments = !days.length && !toSchedule.length && !past.length;
  const nothing = !data.sources.length && noAppointments;
  const openSource = (source: StorySource) => (element: HTMLElement) => sourceDialog.openWith(source, element);
  const openAppointment = (appointment: StoryAppointment) => (element: HTMLElement) => appointmentDialog.openWith(appointment, element);
  const who = (assignees: StorySource["assignees"]) => assigneeAvatars(assignees, data.people);

  return <Card size="sm" role="region" aria-labelledby="ws-reporting-title" id="ws-reporting">
    <CardHeader>
      <CardTitle id="ws-reporting-title" role="heading" aria-level={2}>Reporting</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-4 px-0">
      {failed ? <div className="px-3"><SectionFailed what="the reporting plan" onRetry={() => void reload()} /></div> : nothing
        ? <div className="px-3"><Empty className="py-5">
          <EmptyHeader><EmptyTitle>No sources or interviews yet.</EmptyTitle><EmptyDescription>{caps.addSource || caps.addAppointment ? "Add the people you plan to talk to, even as a role, and when you'll meet them." : "No reporting is assigned to you."}</EmptyDescription></EmptyHeader>
          {addSource || addAppointment ? <EmptyContent className="flex-row justify-center">{addSource}{addAppointment}</EmptyContent> : null}
        </Empty></div>
        : <>
          <section aria-labelledby="ws-sources">
            <GroupHeading id="ws-sources" title="Sources" action={data.sources.length ? addSource : null} />
            {data.sources.length
              ? <ItemGroup role="group" aria-labelledby="ws-sources" className="gap-0">{data.sources.map((source) => <SourceRow key={source.id} source={source} people={who(source.assignees)} timing={sourceTimingLine(source, data.appointments, timezone)} onOpen={openSource(source)} busy={statusBusy(source.id)} onStatus={caps.manageReporting ? (status) => quickStatus.mutate({ kind: "source", id: source.id, status, updatedAt: source.updatedAt }) : undefined} />)}</ItemGroup>
              : <p className="px-3 text-sm text-muted-foreground">No sources yet. {caps.addSource ? "Add the people you plan to interview." : "None are assigned to you."}</p>}
          </section>
          <section aria-labelledby="ws-appointments">
            <GroupHeading id="ws-appointments" title="Appointments" action={noAppointments ? null : addAppointment} />
            <div className="flex flex-col gap-2">
              {days.map(({ day, items }) => <div key={day} className="flex flex-col"><h4 className="px-3 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">{formatDay(day, false)}</h4>
                <ItemGroup role="group" aria-label={formatDay(day, false)} className="gap-0">{items.map((appointment) => <ExactRow key={appointment.id} appointment={appointment} people={who(appointment.assignees)} timezone={timezone} onOpen={openAppointment(appointment)} busy={statusBusy(appointment.id)} onStatus={caps.manageReporting ? (status) => quickStatus.mutate({ kind: "appointment", id: appointment.id, status, updatedAt: appointment.updatedAt }) : undefined} />)}</ItemGroup>
              </div>)}
              {toSchedule.length ? <div className="flex flex-col"><h4 className="px-3 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">To schedule</h4>
                <ItemGroup role="group" aria-label="To schedule" className="gap-0">{toSchedule.map((appointment) => <ToScheduleRow key={appointment.id} appointment={appointment} people={who(appointment.assignees)} timezone={timezone} onOpen={openAppointment(appointment)} busy={statusBusy(appointment.id)} onStatus={caps.manageReporting ? (status) => quickStatus.mutate({ kind: "appointment", id: appointment.id, status, updatedAt: appointment.updatedAt }) : undefined} />)}</ItemGroup>
              </div> : null}
              {past.length ? <Collapsible className="px-1.5">
                <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
                  <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform in-data-panel-open:rotate-90" />Done &amp; cancelled <span className="font-normal">{past.length}</span>
                </CollapsibleTrigger>
                <CollapsibleContent><ItemGroup role="group" aria-label="Done and cancelled" className="gap-0">{past.map((appointment) => <PastRow key={appointment.id} appointment={appointment} people={who(appointment.assignees)} timezone={timezone} onOpen={openAppointment(appointment)} busy={statusBusy(appointment.id)} onStatus={caps.manageReporting ? (status) => quickStatus.mutate({ kind: "appointment", id: appointment.id, status, updatedAt: appointment.updatedAt }) : undefined} />)}</ItemGroup></CollapsibleContent>
              </Collapsible> : null}
              {noAppointments ? <p className="px-3 text-sm text-muted-foreground">No appointments yet. {caps.addAppointment ? "Interviews and shoots, with a date once you know it." : ""}</p> : null}
            </div>
          </section>
        </>}
    </CardContent>
    <SourceDialog key={`source-${sourceDialog.session}`} open={sourceDialog.open} source={sourceDialog.target} onClose={sourceDialog.close} finalFocus={sourceDialog.finalFocus} />
    <AppointmentDialog key={`appointment-${appointmentDialog.session}`} open={appointmentDialog.open} appointment={appointmentDialog.target} onClose={appointmentDialog.close} finalFocus={appointmentDialog.finalFocus} />
  </Card>;
}
