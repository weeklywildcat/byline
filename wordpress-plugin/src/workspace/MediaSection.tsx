import { ChevronRight } from "lucide-react";
import { EmptyState } from "../admin-ui/components/empty-state";
import { ItemButton, ItemList } from "../admin-ui/components/item-list";
import { Panel } from "../admin-ui/components/panel";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { ItemActions, ItemContent, ItemDescription, ItemTitle } from "../admin-ui/ui/item";
import { MediaDialog } from "./MediaDialog";
import { AddButton, Meta, SectionFailed } from "./parts";
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
  const detail = [files ? fileCountLabel(files) : "", ...hints];
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    <ItemContent>
      <ItemTitle>{assignment.title}</ItemTitle>
      <ItemDescription>
        {labelFor(MEDIA_TYPE_LABELS, assignment.type)} · {assignment.assignee?.name || "Unassigned"}{due ? <> · <span className={isOverdue(assignment.dueAt, timezone, now) ? "text-warning" : undefined}>{due}</span></> : null}
      </ItemDescription>
      {detail.some(Boolean) ? <ItemDescription><Meta parts={detail} flag={(index) => (files ? index > 0 : true)} /></ItemDescription> : null}
    </ItemContent>
    <ItemActions>
      <StatusBadge tone={done ? "done" : assignment.status === "needed" ? "attention" : "neutral"}>{labelFor(MEDIA_STATUS_LABELS, assignment.status)}</StatusBadge>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </ItemActions>
  </ItemButton>;
}

export function MediaSection() {
  const { data, timezone, now, caps, sectionError, reload } = useWorkspace();
  const dialog = useDialogTarget<StoryMediaAssignment>("[data-ws-add=media]");
  const failed = sectionError("media");
  // People who hold no production work and cannot add any have nothing to see here.
  if (!failed && !data.mediaAssignments.length && !caps.manageMedia) return null;
  const add = caps.manageMedia && !failed ? <AddButton data-ws-add="media" onClick={(event) => dialog.openWith(null, event.currentTarget)}>Add assignment</AddButton> : null;
  const empty = !failed && !data.mediaAssignments.length;
  return <Panel id="ws-media" title="Media & Production" action={empty ? null : add} contentClassName="px-0">
    {failed ? <SectionFailed what="production assignments" onRetry={() => void reload()} /> : data.mediaAssignments.length
      ? <ItemList>{data.mediaAssignments.map((assignment) => <MediaRow key={assignment.id} assignment={assignment} timezone={timezone} now={now} onOpen={(element) => dialog.openWith(assignment, element)} />)}</ItemList>
      : <div className="px-3"><EmptyState title="No photo, graphic, video or audio work yet.">{add}</EmptyState></div>}
    <MediaDialog key={`media-${dialog.session}`} open={dialog.open} assignment={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Panel>;
}
