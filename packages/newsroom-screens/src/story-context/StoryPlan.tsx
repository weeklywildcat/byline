import { useMemo, type ReactNode } from "react";
import { ArrowRight, Check, Circle, Clock3 } from "lucide-react";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Field, FieldContent, FieldGroup, FieldTitle } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { exactDate, relativeTime } from "../home/newsroom-model";
import { normalizeStoryVideoSettings, STORY_FORMAT_OPTIONS } from "../editorial/story-video-model";
import { AppointmentDialog } from "../workspace/AppointmentDialog";
import { PlanningProperties } from "../workspace/DetailsSection";
import { ResourcesSection } from "../workspace/ResourcesSection";
import { useDialogTarget } from "../workspace/dialog-target";
import { APPOINTMENT_KIND_LABELS, MEDIA_TYPE_LABELS, labelFor } from "../workspace/reporting-model";
import { appointmentTiming } from "../workspace/schedule-model";
import { useWorkspace } from "../workspace/workspace-context";
import { names, openTasks, sectionNames, workspaceActivityCopy } from "../workspace/workspace-model";
import type { StoryAppointment, StoryWorkspace } from "../workspace/workspace-types";
import { Angle, Checklist, ContextSection, MediaContext } from "./StoryContext";

/**
 * The Plan workspace's sections (docs/story-screen.md#plan), built from the
 * same Story Workspace records and dialogs as Story Context. Nothing here is
 * a new record: the brief is the plan's brief, To do is the Story's tasks and
 * media assignments, interviews are its appointments, activity is its audit
 * trail. Quiet headings and rows, never Cards.
 */

/** One fact in the brief: a fixed label column, then the value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Field orientation="horizontal" className="min-h-8 items-center! gap-2">
      <FieldTitle className="w-28 flex-none! font-normal text-muted-foreground">{label}</FieldTitle>
      <FieldContent className="min-w-0 text-sm [overflow-wrap:anywhere]">{children}</FieldContent>
    </Field>
  );
}

const PLURALS: Record<string, string> = { gallery: "galleries", audio: "audio clips", other: "other media", video: "videos" };

/** "Article · 2 photos · 1 graphic": what the Story is expected to deliver, from its type and its media assignments. */
export function deliverables(data: Pick<StoryWorkspace, "format" | "mediaAssignments">): string[] {
  const format = normalizeStoryVideoSettings(data.format).format;
  const parts = [STORY_FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? "Article"];
  const counts = new Map<string, number>();
  for (const assignment of data.mediaAssignments) counts.set(assignment.type, (counts.get(assignment.type) ?? 0) + 1);
  for (const [type, count] of counts) {
    const label = ((MEDIA_TYPE_LABELS as Record<string, string>)[type] ?? "Media item").toLowerCase();
    parts.push(`${count} ${count === 1 ? label : PLURALS[label] ?? `${label}s`}`);
  }
  return parts;
}

/** People working on the Story besides its writers: whoever has its media, tasks or interviews. */
export function otherContributors(data: Pick<StoryWorkspace, "story" | "contributors" | "mediaAssignments" | "tasks" | "appointments">): string[] {
  const writers = new Set((data.contributors.contributors.length ? data.contributors.contributors : data.story.authors).map((person) => Number(person.id)));
  if (data.story.editor) writers.add(data.story.editor.id);
  const others = new Map<number, string>();
  const add = (person: { id: number | string; name: string } | null | undefined) => {
    if (!person || !person.name) return;
    const id = Number(person.id);
    if (!writers.has(id) && !others.has(id)) others.set(id, person.name);
  };
  for (const assignment of data.mediaAssignments) add(assignment.assignee);
  for (const task of data.tasks) if (task.state !== "completed") add(task.assignee as { id: number; name: string } | null);
  for (const appointment of data.appointments) for (const person of appointment.assignees) add(person);
  return [...others.values()];
}

export type StoryBriefProps = {
  /** Where the writers are set (Write → Byline), so a reader who can't edit them here knows where. */
  writersHint?: string;
};

/**
 * A. Story Brief: the assignment, readable at a glance. The Angle (the plan's
 * brief text) is the prominent part; the facts beside it are who, by when and
 * what is expected. Editors change the editor, deadline and publication
 * target in place; everyone else reads them.
 */
export function StoryBrief({ writersHint }: StoryBriefProps) {
  const { data, timezone } = useWorkspace();
  const writers = data.contributors.contributors.length ? data.contributors.contributors : data.story.authors;
  const others = useMemo(() => otherContributors(data), [data]);
  const expected = useMemo(() => deliverables(data), [data]);
  const sections = sectionNames(data.sections);
  return (
    <div className="grid gap-6 @3xl/plan:grid-cols-[minmax(0,1fr)_20rem] @3xl/plan:gap-10" data-story-brief="">
      <div className="flex min-w-0 flex-col gap-5">
        <Angle id="plan-angle" title="Angle and assignment" level={3} prominent prompt="The story's central question, what the reporter should find out, who to talk to, and anything still unresolved." />
        <ContextSection id="plan-deliverables" title="Expected" level={3}>
          <p className="text-sm" data-story-deliverables="">{expected.join(" · ")}</p>
        </ContextSection>
        <ResourcesSection plain title="Background and links" headingLevel={3} />
      </div>
      <div className="flex min-w-0 flex-col gap-1 @3xl/plan:border-l @3xl/plan:border-border @3xl/plan:pl-6">
        <h3 className="sr-only">Assignment</h3>
        <FieldGroup className="gap-1">
          <Fact label={writers.length === 1 ? "Reporter" : "Reporters"}>
            {writers.length ? <span className="flex min-w-0 items-center gap-2"><PeopleAvatars people={writers} tooltips={false} /><span className="min-w-0">{names(writers)}</span></span> : <span className="text-muted-foreground">No one yet{writersHint ? ` · ${writersHint}` : ""}</span>}
          </Fact>
          {others.length ? <Fact label="Also on it">{others.join(", ")}</Fact> : null}
        </FieldGroup>
        <PlanningProperties compact />
        <FieldGroup className="gap-1">
          <Fact label="Section">{sections || <span className="text-muted-foreground">None</span>}</Fact>
          {data.story.publicationState.isScheduled && data.story.publicationState.scheduledAt ? <Fact label="Scheduled">{exactDate(data.story.publicationState.scheduledAt, timezone)}</Fact> : null}
        </FieldGroup>
      </div>
    </div>
  );
}

const OPEN_APPOINTMENT = new Set(["planned", "tentative", "confirmed"]);

/**
 * C. To do: the Story's outstanding work in one scannable place. Tasks (the
 * checklist), interviews still to happen and the media it needs. Each row
 * is the existing record, edited in its existing dialog; nothing is copied
 * into a second task list.
 */
export function StoryToDo({ leadImage, onOpenReporting }: { leadImage: { url: string | null; alt: string | null } | null; onOpenReporting: () => void }) {
  const { data, timezone } = useWorkspace();
  const appointmentDialog = useDialogTarget<StoryAppointment>("[data-plan-todo=interviews]");
  const interviews = data.appointments
    .filter((appointment) => OPEN_APPOINTMENT.has(appointment.status))
    .sort((a, b) => (a.startAt ?? a.windowStart ?? "9999").localeCompare(b.startAt ?? b.windowStart ?? "9999"));
  const waiting = data.sources.filter((source) => source.status !== "interviewed" && source.status !== "declined" && source.status !== "unavailable").length;
  return (
    <div className="grid gap-6 @3xl/plan:grid-cols-2 @3xl/plan:gap-10" data-story-todo="">
      <div className="flex min-w-0 flex-col gap-6">
        <Checklist id="plan-tasks" title="Tasks" level={3} />
        <ContextSection id="plan-interviews" title="Interviews and appointments" level={3}>
          {interviews.length ? (
            <ItemGroup className="gap-0" aria-label="Interviews and appointments to do" data-plan-todo="interviews">
              {interviews.map((appointment) => {
                const timing = appointmentTiming(appointment, timezone).primary;
                return (
                  <Item key={appointment.id} size="xs" className="px-0" render={<button type="button" onClick={(event) => appointmentDialog.openWith(appointment, event.currentTarget)} />}>
                    <ItemMedia variant="icon" className="text-muted-foreground [&_svg]:size-4">{appointment.startAt ? <Clock3 aria-label="Scheduled" /> : <Circle aria-label="Not scheduled" />}</ItemMedia>
                    <ItemContent>
                      <ItemTitle className="font-normal">{appointment.title}</ItemTitle>
                      <ItemDescription>{[labelFor(APPOINTMENT_KIND_LABELS, appointment.kind), timing, appointment.assignees.map((person) => person.name).join(", ")].filter(Boolean).join(" · ")}</ItemDescription>
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          ) : <p className="text-sm text-muted-foreground">No interviews or appointments waiting.</p>}
          {waiting ? (
            <Button type="button" variant="link" size="sm" className="h-auto w-fit p-0" onClick={onOpenReporting}>
              {waiting} {waiting === 1 ? "source" : "sources"} not yet interviewed<ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          ) : null}
          <AppointmentDialog key={`plan-appointment-${appointmentDialog.session}`} open={appointmentDialog.open} appointment={appointmentDialog.target} onClose={appointmentDialog.close} finalFocus={appointmentDialog.finalFocus} />
        </ContextSection>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <MediaContext id="plan-media" title="Photos, video and graphics" level={3} leadImage={leadImage} />
      </div>
    </div>
  );
}

/** How much is still open on the Story, for To do's heading. */
export function useOpenWorkCount(): number {
  const { data } = useWorkspace();
  const media = data.mediaAssignments.filter((assignment) => assignment.status !== "done" && assignment.status !== "selected").length;
  const appointments = data.appointments.filter((appointment) => OPEN_APPOINTMENT.has(appointment.status)).length;
  return openTasks(data.tasks).length + media + appointments;
}

/**
 * D. Recent activity: the latest few changes, as supporting information.
 * The full audit trail is History. Participants never receive the trail.
 */
export function StoryRecentActivity({ onOpenHistory, limit = 6 }: { onOpenHistory?: () => void; limit?: number }) {
  const { data, timezone, now, caps } = useWorkspace();
  if (caps.role === "participant") return null;
  const items = data.activity.slice(0, limit);
  return (
    <ContextSection id="plan-recent-activity" title="Recent changes" level={3} action={onOpenHistory ? <Button type="button" variant="ghost" size="xs" onClick={onOpenHistory}>Full history<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button> : null}>
      {items.length ? (
        <ItemGroup className="gap-0" aria-label="Recent changes">
          {items.map((item) => (
            <Item key={item.id} size="xs" className="px-0">
              <ItemMedia variant="icon" className="text-muted-foreground [&_svg]:size-3.5"><Check aria-hidden="true" /></ItemMedia>
              <ItemContent><ItemTitle className="line-clamp-none font-normal">{workspaceActivityCopy(item)}</ItemTitle></ItemContent>
              <ItemActions><time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={item.occurredAt} title={exactDate(item.occurredAt, timezone)}>{relativeTime(item.occurredAt, timezone, now)}</time></ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
    </ContextSection>
  );
}
