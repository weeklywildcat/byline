import { ChevronRight } from "lucide-react";
import { AddButton, Meta, Note, SectionFailed, SectionHeading, StatusBadge } from "./fields";
import { MediaDialog } from "./MediaDialog";
import { useDialogTarget } from "./dialog-target";
import { fileCountLabel, mediaReadinessHints } from "./media-form";
import { MEDIA_STATUS_LABELS, MEDIA_TYPE_LABELS, labelFor } from "./reporting-model";
import { dueText, isOverdue } from "./workspace-model";
import { useWorkspace } from "./workspace-context";
import type { StoryMediaAssignment } from "./workspace-types";

function MediaRow({ assignment, timezone, now, onOpen }: { assignment: StoryMediaAssignment; timezone: string; now: Date; onOpen: (element: HTMLElement) => void }) {
  const done = assignment.status === "done";
  const due = done ? "" : dueText(assignment.dueAt, timezone, now);
  const files = assignment.attachmentIds.length;
  const hints = mediaReadinessHints(assignment);
  const sub = [labelFor(MEDIA_TYPE_LABELS, assignment.type), assignment.assignee?.name || "Unassigned"].join(" · ");
  const detail = [files ? fileCountLabel(files) : "", ...hints];
  return <li>
    <button type="button" className="ws-row" onClick={(event) => onOpen(event.currentTarget)}>
      <span className="ws-row-main">
        <span className="ws-row-title">{assignment.title}</span>
        <span className="ws-row-sub">{sub}{due ? <> · <span className={isOverdue(assignment.dueAt, timezone, now) ? "ws-overdue" : undefined}>{due}</span></> : null}</span>
        <Meta parts={detail} flag={(index) => (files ? index > 0 : true)} />
      </span>
      <StatusBadge tone={done ? "done" : assignment.status === "needed" ? "attention" : "neutral"}>{labelFor(MEDIA_STATUS_LABELS, assignment.status)}</StatusBadge>
      <ChevronRight className="ws-row-chevron" aria-hidden="true" />
    </button>
  </li>;
}

export function MediaSection() {
  const { data, timezone, now, caps, sectionError, reload } = useWorkspace();
  const dialog = useDialogTarget<StoryMediaAssignment>("[data-ws-add=media]");
  const failed = sectionError("media");
  // People who hold no production work and cannot add any have nothing to see here.
  if (!failed && !data.mediaAssignments.length && !caps.manageMedia) return null;
  return <section aria-labelledby="ws-media" className="ws-section ws-media">
    <SectionHeading id="ws-media" title="Media & Production">{caps.manageMedia && !failed ? <AddButton data-ws-add="media" onClick={(event) => dialog.openWith(null, event.currentTarget)}>Add assignment</AddButton> : null}</SectionHeading>
    {failed ? <SectionFailed what="production assignments" onRetry={() => void reload()} /> : data.mediaAssignments.length
      ? <ul className="ws-rows">{data.mediaAssignments.map((assignment) => <MediaRow key={assignment.id} assignment={assignment} timezone={timezone} now={now} onOpen={(element) => dialog.openWith(assignment, element)} />)}</ul>
      : <Note>No photo, graphic, video or audio work yet.</Note>}
    <MediaDialog key={`media-${dialog.session}`} open={dialog.open} assignment={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </section>;
}
