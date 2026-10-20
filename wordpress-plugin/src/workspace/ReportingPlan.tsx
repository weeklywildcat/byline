import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { ItemButton } from "../admin-ui/components/item-button";
import { PeopleAvatars, anyPicture, type AvatarPerson } from "../admin-ui/components/people-avatars";
import { StatusBadge, type StatusTone } from "../admin-ui/components/status-badge";
import { Button } from "../admin-ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../admin-ui/ui/collapsible";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { AppointmentDialog } from "./AppointmentDialog";
import { SourceDialog } from "./SourceDialog";
import { AddButton, SectionFailed } from "./parts";
import { useDialogTarget } from "./dialog-target";
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUS_LABELS, SOURCE_STATUS_LABELS, labelFor, sourceTimingLine } from "./reporting-model";
import { appointmentTiming, formatDay, formatTime, formatTimeRange, splitAppointments } from "./schedule-model";
import { assigneeAvatars } from "./workspace-model";
import { useWorkspace } from "./workspace-context";
import type { StoryAppointment, StorySource } from "./workspace-types";

const sourceTone = (status: StorySource["status"]): StatusTone => (status === "needs-scheduling" ? "attention" : status === "interviewed" ? "done" : "neutral");

type Open = (element: HTMLElement) => void;
const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

function SourceRow({ source, people, timing, onOpen }: { source: StorySource; people: AvatarPerson[]; timing: string; onOpen: Open }) {
  const detail = [source.role, source.organization].filter(Boolean).join(" · ");
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    {anyPicture(people) ? <ItemMedia><PeopleAvatars people={people} /></ItemMedia> : null}
    <ItemContent>
      <ItemTitle>{source.label}</ItemTitle>
      <ItemDescription>{detail}{people.length ? null : <>{detail ? " · " : ""}Unassigned</>}</ItemDescription>
      {timing ? <ItemDescription>{timing}</ItemDescription> : null}
    </ItemContent>
    <ItemActions><StatusBadge tone={sourceTone(source.status)}>{SOURCE_STATUS_LABELS[source.status]}</StatusBadge><Chevron /></ItemActions>
  </ItemButton>;
}

function appointmentSub(appointment: StoryAppointment, withStatus: boolean) {
  const parts = [appointment.location, appointment.sourceLabel && !appointment.title.includes(appointment.sourceLabel) ? appointment.sourceLabel : ""];
  if (appointment.status === "tentative" || withStatus) parts.push(labelFor(APPOINTMENT_STATUS_LABELS, appointment.status));
  return parts.filter(Boolean).join(" · ");
}

function ExactRow({ appointment, people, timezone, onOpen }: { appointment: StoryAppointment; people: AvatarPerson[]; timezone: string; onOpen: Open }) {
  const range = formatTimeRange(appointment.startAt!, appointment.endAt, timezone);
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemMedia className="w-[4.5rem] justify-start text-sm font-medium whitespace-nowrap tabular-nums"><span aria-hidden="true">{formatTime(appointment.startAt!, timezone)}</span><span className="sr-only">{range}</span></ItemMedia>
    <ItemContent><ItemTitle>{appointment.title}</ItemTitle><ItemDescription>{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</ItemDescription></ItemContent>
    <ItemActions><PeopleAvatars people={people} /><Chevron /></ItemActions>
  </ItemButton>;
}

function ToScheduleRow({ appointment, people, timezone, onOpen }: { appointment: StoryAppointment; people: AvatarPerson[]; timezone: string; onOpen: Open }) {
  // Never a time here: only a target range, or honestly "Not scheduled".
  const { primary } = appointmentTiming(appointment, timezone);
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent><ItemTitle>{appointment.title}</ItemTitle><ItemDescription>{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</ItemDescription></ItemContent>
    <ItemActions><span className="text-xs text-muted-foreground">{primary}</span><PeopleAvatars people={people} /><Chevron /></ItemActions>
  </ItemButton>;
}

function PastRow({ appointment, people, timezone, onOpen }: { appointment: StoryAppointment; people: AvatarPerson[]; timezone: string; onOpen: Open }) {
  const timing = appointment.scheduleMode === "unscheduled" ? "" : appointmentTiming(appointment, timezone).primary;
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent><ItemTitle className="text-muted-foreground">{appointment.title}</ItemTitle><ItemDescription>{[labelFor(APPOINTMENT_STATUS_LABELS, appointment.status), timing].filter(Boolean).join(" · ")}</ItemDescription></ItemContent>
    <ItemActions><PeopleAvatars people={people} /><Chevron /></ItemActions>
  </ItemButton>;
}

/** A group heading inside the card: Item's own header row, label left, action right. */
function GroupHeading({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return <Item size="xs" className="py-1"><ItemHeader><ItemTitle id={id} role="heading" aria-level={3}>{title}</ItemTitle>{action ? <ItemActions>{action}</ItemActions> : null}</ItemHeader></Item>;
}

export function ReportingPlan() {
  const { data, timezone, caps, appointmentId, reload, sectionError } = useWorkspace();
  const sourceDialog = useDialogTarget<StorySource>("[data-ws-add=source]");
  const appointmentDialog = useDialogTarget<StoryAppointment>("[data-ws-add=appointment]");
  const deepLinked = useRef(false);
  const failed = sectionError("reporting");
  const { days, toSchedule, past } = splitAppointments(data.appointments, timezone);

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
              ? <ItemGroup role="group" aria-labelledby="ws-sources" className="gap-0">{data.sources.map((source) => <SourceRow key={source.id} source={source} people={who(source.assignees)} timing={sourceTimingLine(source, data.appointments, timezone)} onOpen={openSource(source)} />)}</ItemGroup>
              : <p className="px-3 text-sm text-muted-foreground">No sources yet. {caps.addSource ? "Add the people you plan to interview." : "None are assigned to you."}</p>}
          </section>
          <section aria-labelledby="ws-appointments">
            <GroupHeading id="ws-appointments" title="Appointments" action={noAppointments ? null : addAppointment} />
            <div className="flex flex-col gap-2">
              {days.map(({ day, items }) => <div key={day} className="flex flex-col"><h4 className="px-3 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">{formatDay(day, false)}</h4>
                <ItemGroup role="group" aria-label={formatDay(day, false)} className="gap-0">{items.map((appointment) => <ExactRow key={appointment.id} appointment={appointment} people={who(appointment.assignees)} timezone={timezone} onOpen={openAppointment(appointment)} />)}</ItemGroup>
              </div>)}
              {toSchedule.length ? <div className="flex flex-col"><h4 className="px-3 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">To schedule</h4>
                <ItemGroup role="group" aria-label="To schedule" className="gap-0">{toSchedule.map((appointment) => <ToScheduleRow key={appointment.id} appointment={appointment} people={who(appointment.assignees)} timezone={timezone} onOpen={openAppointment(appointment)} />)}</ItemGroup>
              </div> : null}
              {past.length ? <Collapsible className="px-1.5">
                <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
                  <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform in-data-panel-open:rotate-90" />Done &amp; cancelled <span className="font-normal">{past.length}</span>
                </CollapsibleTrigger>
                <CollapsibleContent><ItemGroup role="group" aria-label="Done and cancelled" className="gap-0">{past.map((appointment) => <PastRow key={appointment.id} appointment={appointment} people={who(appointment.assignees)} timezone={timezone} onOpen={openAppointment(appointment)} />)}</ItemGroup></CollapsibleContent>
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
