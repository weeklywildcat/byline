import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "../admin-ui/components/empty-state";
import { ItemButton, ItemList } from "../admin-ui/components/item-list";
import { Panel } from "../admin-ui/components/panel";
import { StatusBadge, type StatusTone } from "../admin-ui/components/status-badge";
import { Button } from "../admin-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../admin-ui/ui/collapsible";
import { ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { AppointmentDialog } from "./AppointmentDialog";
import { SourceDialog } from "./SourceDialog";
import { SubHeading } from "../admin-ui/components/sub-heading";
import { AddButton, SectionFailed } from "./parts";
import { useDialogTarget } from "./dialog-target";
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUS_LABELS, SOURCE_STATUS_LABELS, labelFor, sourceTimingLine } from "./reporting-model";
import { appointmentTiming, formatDay, formatTime, formatTimeRange, splitAppointments } from "./schedule-model";
import { names } from "./workspace-model";
import { useWorkspace } from "./workspace-context";
import type { StoryAppointment, StorySource } from "./workspace-types";

const sourceTone = (status: StorySource["status"]): StatusTone => (status === "needs-scheduling" ? "attention" : status === "interviewed" ? "done" : "neutral");

type Open = (element: HTMLElement) => void;
const Chevron = () => <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;

function SourceRow({ source, timing, onOpen }: { source: StorySource; timing: string; onOpen: Open }) {
  const detail = [source.role, source.organization].filter(Boolean).join(" · ");
  const people = names(source.assignees);
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent>
      <ItemTitle>{source.label}</ItemTitle>
      {detail || people ? <ItemDescription>{[detail, people].filter(Boolean).join(" · ")}</ItemDescription> : null}
      {timing ? <ItemDescription>{timing}</ItemDescription> : null}
    </ItemContent>
    <ItemActions><StatusBadge tone={sourceTone(source.status)}>{SOURCE_STATUS_LABELS[source.status]}</StatusBadge><Chevron /></ItemActions>
  </ItemButton>;
}

function appointmentSub(appointment: StoryAppointment, withStatus: boolean) {
  const parts = [names(appointment.assignees), appointment.location, appointment.sourceLabel && !appointment.title.includes(appointment.sourceLabel) ? appointment.sourceLabel : ""];
  if (appointment.status === "tentative" || withStatus) parts.push(labelFor(APPOINTMENT_STATUS_LABELS, appointment.status));
  return parts.filter(Boolean).join(" · ");
}

function ExactRow({ appointment, timezone, onOpen }: { appointment: StoryAppointment; timezone: string; onOpen: Open }) {
  const range = formatTimeRange(appointment.startAt!, appointment.endAt, timezone);
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemMedia className="w-[4.5rem] justify-start text-sm font-medium whitespace-nowrap tabular-nums"><span aria-hidden="true">{formatTime(appointment.startAt!, timezone)}</span><span className="sr-only">{range}</span></ItemMedia>
    <ItemContent><ItemTitle>{appointment.title}</ItemTitle><ItemDescription>{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</ItemDescription></ItemContent>
    <ItemActions><Chevron /></ItemActions>
  </ItemButton>;
}

function ToScheduleRow({ appointment, timezone, onOpen }: { appointment: StoryAppointment; timezone: string; onOpen: Open }) {
  // Never a time here: only a target range, or honestly "Not scheduled".
  const { primary } = appointmentTiming(appointment, timezone);
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent><ItemTitle>{appointment.title}</ItemTitle><ItemDescription>{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</ItemDescription></ItemContent>
    <ItemActions><span className="text-xs text-muted-foreground">{primary}</span><Chevron /></ItemActions>
  </ItemButton>;
}

function PastRow({ appointment, timezone, onOpen }: { appointment: StoryAppointment; timezone: string; onOpen: Open }) {
  const timing = appointment.scheduleMode === "unscheduled" ? "" : appointmentTiming(appointment, timezone).primary;
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent><ItemTitle className="text-muted-foreground">{appointment.title}</ItemTitle><ItemDescription>{[labelFor(APPOINTMENT_STATUS_LABELS, appointment.status), timing].filter(Boolean).join(" · ")}</ItemDescription></ItemContent>
    <ItemActions><Chevron /></ItemActions>
  </ItemButton>;
}

function DayGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col"><h4 className="px-3 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">{label}</h4>{children}</div>;
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
  const openSource = (source: StorySource) => (element: HTMLElement) => sourceDialog.openWith(source, element);
  const openAppointment = (appointment: StoryAppointment) => (element: HTMLElement) => appointmentDialog.openWith(appointment, element);

  return <Panel id="ws-reporting" title="Reporting" contentClassName="flex flex-col gap-5 px-0">
    {failed ? <SectionFailed what="the reporting plan" onRetry={() => void reload()} /> : <>
      <section aria-labelledby="ws-sources">
        <div className="px-3"><SubHeading id="ws-sources" title="Sources">{data.sources.length ? addSource : null}</SubHeading></div>
        {data.sources.length
          ? <ItemList>{data.sources.map((source) => <SourceRow key={source.id} source={source} timing={sourceTimingLine(source, data.appointments, timezone)} onOpen={openSource(source)} />)}</ItemList>
          : <div className="px-3"><EmptyState title="No sources yet." description={caps.addSource ? "Add the people you plan to interview, even as a role." : "No sources are assigned to you."}>{addSource}</EmptyState></div>}
      </section>
      <section aria-labelledby="ws-appointments">
        <div className="px-3"><SubHeading id="ws-appointments" title="Appointments">{noAppointments ? null : addAppointment}</SubHeading></div>
        <div className="flex flex-col gap-2">
          {days.map(({ day, items }) => <DayGroup key={day} label={formatDay(day, false)}>
            <ItemList>{items.map((appointment) => <ExactRow key={appointment.id} appointment={appointment} timezone={timezone} onOpen={openAppointment(appointment)} />)}</ItemList>
          </DayGroup>)}
          {toSchedule.length ? <DayGroup label="To schedule">
            <ItemList>{toSchedule.map((appointment) => <ToScheduleRow key={appointment.id} appointment={appointment} timezone={timezone} onOpen={openAppointment(appointment)} />)}</ItemList>
          </DayGroup> : null}
          {past.length ? <Collapsible className="px-1.5">
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
              <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform in-data-panel-open:rotate-90" />Done &amp; cancelled <span className="font-normal">{past.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent><ItemList>{past.map((appointment) => <PastRow key={appointment.id} appointment={appointment} timezone={timezone} onOpen={openAppointment(appointment)} />)}</ItemList></CollapsibleContent>
          </Collapsible> : null}
          {noAppointments ? <div className="px-3"><EmptyState title="No appointments yet." description="Interviews and shoots, with a date once you know it.">{addAppointment}</EmptyState></div> : null}
        </div>
      </section>
    </>}
    <SourceDialog key={`source-${sourceDialog.session}`} open={sourceDialog.open} source={sourceDialog.target} onClose={sourceDialog.close} finalFocus={sourceDialog.finalFocus} />
    <AppointmentDialog key={`appointment-${appointmentDialog.session}`} open={appointmentDialog.open} appointment={appointmentDialog.target} onClose={appointmentDialog.close} finalFocus={appointmentDialog.finalFocus} />
  </Panel>;
}
