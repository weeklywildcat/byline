import { ChevronRight } from "lucide-react";
import { ItemButton } from "../admin-ui/components/item-button";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { mediaTypeIcons } from "../home/media-icons";
import { MediaDialog } from "./MediaDialog";
import { AddButton, Meta, SectionFailed } from "./parts";
import { useDialogTarget } from "./dialog-target";
import { fileCountLabel, mediaReadinessHints } from "./media-form";
import { MEDIA_STATUS_LABELS, MEDIA_TYPE_LABELS, labelFor } from "./reporting-model";
import { assigneeAvatars, dueText, isOverdue } from "./workspace-model";
import { useWorkspace } from "./workspace-context";
import type { ContributorEntry } from "../editorial/editorial-model";
import type { StoryMediaAssignment } from "./workspace-types";

function MediaRow({ assignment, people, timezone, now, onOpen }: { assignment: StoryMediaAssignment; people: ContributorEntry[]; timezone: string; now: Date; onOpen: (element: HTMLElement) => void }) {
  const Icon = mediaTypeIcons[assignment.type] || mediaTypeIcons.other;
  const done = assignment.status === "done";
  const due = done ? "" : dueText(assignment.dueAt, timezone, now);
  const files = assignment.attachmentIds.length;
  const hints = mediaReadinessHints(assignment);
  const detail = [files ? fileCountLabel(files) : "", ...hints];
  return <ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>
    {assignment.assignee ? <ItemMedia><PeopleAvatars people={assigneeAvatars([assignment.assignee], people)} /></ItemMedia> : <ItemMedia variant="icon" className="size-6 rounded-full bg-muted text-muted-foreground"><Icon aria-hidden="true" /></ItemMedia>}
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
  return <Card size="sm" role="region" aria-labelledby="ws-media-title" id="ws-media">
    <CardHeader>
      <CardTitle id="ws-media-title" role="heading" aria-level={2}>Media &amp; Production</CardTitle>
      {empty || !add ? null : <CardAction>{add}</CardAction>}
    </CardHeader>
    <CardContent className="px-0">
      {failed ? <div className="px-3"><SectionFailed what="production assignments" onRetry={() => void reload()} /></div> : data.mediaAssignments.length
        ? <ItemGroup role="group" aria-label="Production assignments" className="gap-0">{data.mediaAssignments.map((assignment) => <MediaRow key={assignment.id} assignment={assignment} people={data.people} timezone={timezone} now={now} onOpen={(element) => dialog.openWith(assignment, element)} />)}</ItemGroup>
        : <div className="px-3"><Empty className="border"><EmptyHeader><EmptyTitle>No photo, graphic, video or audio work yet.</EmptyTitle></EmptyHeader>{add ? <EmptyContent>{add}</EmptyContent> : null}</Empty></div>}
    </CardContent>
    <MediaDialog key={`media-${dialog.session}`} open={dialog.open} assignment={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Card>;
}
