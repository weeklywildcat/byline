import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "../home/ui/skeleton";
import { AddButton, Meta, Note, SectionFailed, SectionHeading, StatusBadge } from "./fields";
import { AppointmentDialog } from "./AppointmentDialog";
import { SourceDialog } from "./SourceDialog";
import { useDialogTarget } from "./dialog-target";
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUS_LABELS, SOURCE_STATUS_LABELS, labelFor, sourceTimingLine } from "./reporting-model";
import { appointmentTiming, formatDay, formatTime, formatTimeRange, splitAppointments } from "./schedule-model";
import { names } from "./workspace-model";
import { useWorkspace } from "./workspace-context";
import type { StoryAppointment, StorySource } from "./workspace-types";

function sourceTone(status: StorySource["status"]) {
  return status === "needs-scheduling" ? "attention" : status === "declined" || status === "unavailable" ? "muted" : status === "interviewed" ? "done" : "neutral";
}

function SourceRow({ source, timing, onOpen }: { source: StorySource; timing: string; onOpen: (element: HTMLElement) => void }) {
  const detail = [source.role, source.organization].filter(Boolean).join(" · ");
  const people = names(source.assignees);
  return <li>
    <button type="button" className="ws-row" onClick={(event) => onOpen(event.currentTarget)}>
      <span className="ws-row-main">
        <span className="ws-row-title">{source.label}</span>
        {detail ? <span className="ws-row-sub">{detail}</span> : null}
        <Meta parts={[people, timing]} />
      </span>
      <StatusBadge tone={sourceTone(source.status)}>{SOURCE_STATUS_LABELS[source.status]}</StatusBadge>
      <ChevronRight className="ws-row-chevron" aria-hidden="true" />
    </button>
  </li>;
}

function appointmentSub(appointment: StoryAppointment, withStatus: boolean) {
  const parts = [names(appointment.assignees), appointment.location, appointment.sourceLabel && !appointment.title.includes(appointment.sourceLabel) ? appointment.sourceLabel : ""];
  if (appointment.status === "tentative" || withStatus) parts.push(labelFor(APPOINTMENT_STATUS_LABELS, appointment.status));
  return parts.filter(Boolean).join(" · ");
}

function ExactRow({ appointment, timezone, onOpen }: { appointment: StoryAppointment; timezone: string; onOpen: (element: HTMLElement) => void }) {
  const range = formatTimeRange(appointment.startAt!, appointment.endAt, timezone);
  return <li>
    <button type="button" className="ws-row ws-appointment" onClick={(event) => onOpen(event.currentTarget)}>
      <span className="ws-time"><span aria-hidden="true">{formatTime(appointment.startAt!, timezone)}</span><span className="sr-only">{range}</span></span>
      <span className="ws-row-main"><span className="ws-row-title">{appointment.title}</span><span className="ws-row-sub">{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</span></span>
      <ChevronRight className="ws-row-chevron" aria-hidden="true" />
    </button>
  </li>;
}

function ToScheduleRow({ appointment, timezone, onOpen }: { appointment: StoryAppointment; timezone: string; onOpen: (element: HTMLElement) => void }) {
  // Never a time here: only a target range, or honestly "Not scheduled".
  const { primary } = appointmentTiming(appointment, timezone);
  return <li>
    <button type="button" className="ws-row ws-appointment ws-unscheduled" onClick={(event) => onOpen(event.currentTarget)}>
      <span className="ws-row-main"><span className="ws-row-title">{appointment.title}</span><span className="ws-row-sub">{appointmentSub(appointment, false) || labelFor(APPOINTMENT_KIND_LABELS, appointment.kind)}</span></span>
      <span className="ws-target">{primary}</span>
      <ChevronRight className="ws-row-chevron" aria-hidden="true" />
    </button>
  </li>;
}

function PastRow({ appointment, timezone, onOpen }: { appointment: StoryAppointment; timezone: string; onOpen: (element: HTMLElement) => void }) {
  const timing = appointment.scheduleMode === "unscheduled" ? "" : appointmentTiming(appointment, timezone).primary;
  return <li>
    <button type="button" className="ws-row ws-appointment ws-past" onClick={(event) => onOpen(event.currentTarget)}>
      <span className="ws-row-main"><span className="ws-row-title">{appointment.title}</span><span className="ws-row-sub">{[labelFor(APPOINTMENT_STATUS_LABELS, appointment.status), timing].filter(Boolean).join(" · ")}</span></span>
      <ChevronRight className="ws-row-chevron" aria-hidden="true" />
    </button>
  </li>;
}

export function ReportingPlanSkeleton() {
  return <div aria-busy="true" aria-label="Loading the reporting plan" className="ws-skeleton">{[0, 1, 2].map((i) => <div key={i}><Skeleton className="h-3 w-2/5" /><Skeleton className="mt-2 h-2.5 w-3/5" /></div>)}</div>;
}

export function ReportingPlan() {
  const { data, timezone, caps, appointmentId, reload, sectionError } = useWorkspace();
  const sourceDialog = useDialogTarget<StorySource>("[data-ws-add=source]");
  const appointmentDialog = useDialogTarget<StoryAppointment>("[data-ws-add=appointment]");
  const [showPast, setShowPast] = useState(false);
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

  return <section aria-labelledby="ws-reporting" className="ws-section ws-reporting">
    <SectionHeading id="ws-reporting" title="Reporting Plan" />
    {failed ? <SectionFailed what="the reporting plan" onRetry={() => void reload()} /> : <>
      <div className="ws-subsection">
        <SectionHeading level={3} title="Sources">{caps.addSource ? <AddButton data-ws-add="source" onClick={(event) => sourceDialog.openWith(null, event.currentTarget)}>Add source</AddButton> : null}</SectionHeading>
        {data.sources.length ? <ul className="ws-rows">{data.sources.map((source) => <SourceRow key={source.id} source={source} timing={sourceTimingLine(source, data.appointments, timezone)} onOpen={(element) => sourceDialog.openWith(source, element)} />)}</ul> : <Note>{caps.addSource ? "No sources yet. Add the people you plan to talk to, even as a role." : "No sources are assigned to you."}</Note>}
      </div>
      <div className="ws-subsection">
        <SectionHeading level={3} title="Appointments">{caps.addAppointment ? <AddButton data-ws-add="appointment" onClick={(event) => appointmentDialog.openWith(null, event.currentTarget)}>Add appointment</AddButton> : null}</SectionHeading>
        {days.map(({ day, items }) => <div key={day} className="ws-group">
          <h4 className="ws-group-title">{formatDay(day, false).toUpperCase()}</h4>
          <ul className="ws-rows">{items.map((appointment) => <ExactRow key={appointment.id} appointment={appointment} timezone={timezone} onOpen={(element) => appointmentDialog.openWith(appointment, element)} />)}</ul>
        </div>)}
        {toSchedule.length ? <div className="ws-group">
          <h4 className="ws-group-title">TO SCHEDULE</h4>
          <ul className="ws-rows">{toSchedule.map((appointment) => <ToScheduleRow key={appointment.id} appointment={appointment} timezone={timezone} onOpen={(element) => appointmentDialog.openWith(appointment, element)} />)}</ul>
        </div> : null}
        {past.length ? <div className="ws-group">
          <button type="button" className="ws-disclosure" aria-expanded={showPast} aria-controls="ws-past-appointments" onClick={() => setShowPast((open) => !open)}><ChevronRight aria-hidden="true" />Done &amp; cancelled <span>{past.length}</span></button>
          {showPast ? <ul className="ws-rows" id="ws-past-appointments">{past.map((appointment) => <PastRow key={appointment.id} appointment={appointment} timezone={timezone} onOpen={(element) => appointmentDialog.openWith(appointment, element)} />)}</ul> : null}
        </div> : null}
        {!days.length && !toSchedule.length && !past.length ? <Note>No appointments yet.</Note> : null}
      </div>
    </>}
    <SourceDialog key={`source-${sourceDialog.session}`} open={sourceDialog.open} source={sourceDialog.target} onClose={sourceDialog.close} finalFocus={sourceDialog.finalFocus} />
    <AppointmentDialog key={`appointment-${appointmentDialog.session}`} open={appointmentDialog.open} appointment={appointmentDialog.target} onClose={appointmentDialog.close} finalFocus={appointmentDialog.finalFocus} />
  </section>;
}
