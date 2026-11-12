import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { PeopleAvatars, anyPicture } from "@byline/newsroom-ui/components/people-avatars";
import { WorkStatusBadge, mediaIntensity } from "@byline/newsroom-ui/components/work-status-badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@byline/newsroom-ui/ui/context-menu";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { mediaTypeIcons } from "../story/media-icons";
import { MediaDialog } from "./MediaDialog";
import { AddButton, Meta, SectionFailed } from "./parts";
import { useDialogTarget } from "./dialog-target";
import { fileCountLabel, mediaReadinessHints } from "./media-form";
import { MEDIA_STATUS_LABELS, MEDIA_TYPE_LABELS, labelFor } from "./reporting-model";
import { assigneeAvatars, dueText, isOverdue } from "./workspace-model";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { applyMedia } from "./workspace-cache";
import { workspaceError } from "./workspace-errors";
import type { ContributorEntry } from "../editorial/editorial-model";

const STATUS_OPTIONS = MEDIA_ASSIGNMENT_STATUSES.map((value) => ({ value, label: labelFor(MEDIA_STATUS_LABELS, value) }));
import { MEDIA_ASSIGNMENT_STATUSES, type MediaAssignmentStatus, type StoryMediaAssignment } from "./workspace-types";

function MediaRow({ assignment, people, timezone, now, onOpen, onStatus, busy, canUpdateStatus }: { assignment: StoryMediaAssignment; people: ContributorEntry[]; timezone: string; now: Date; onOpen: (element: HTMLElement) => void; onStatus: (status: MediaAssignmentStatus) => void; busy: boolean; canUpdateStatus: boolean }) {
  const Icon = mediaTypeIcons[assignment.type] || mediaTypeIcons.other;
  const done = assignment.status === "done" || assignment.status === "selected";
  const due = done ? "" : dueText(assignment.dueAt, timezone, now);
  const files = assignment.attachmentIds.length;
  const hints = mediaReadinessHints(assignment);
  const detail = [files ? fileCountLabel(files) : "", ...hints];
  const completionLabel = done ? `Reopen ${assignment.title}` : `Mark ${assignment.title} done`;
  return <ContextMenu>
    <ContextMenuTrigger render={<Item size="sm" data-media-assignment={assignment.id} />}>
      <ItemMedia>
        {canUpdateStatus
          ? <Checkbox aria-label={completionLabel} checked={done} disabled={busy} onCheckedChange={(checked) => onStatus(checked ? "done" : "in-progress")} />
          : assignment.assignee && anyPicture(assigneeAvatars([assignment.assignee], people))
            ? <PeopleAvatars people={assigneeAvatars([assignment.assignee], people)} />
            : <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon aria-hidden="true" /></span>}
      </ItemMedia>
      <ItemContent>
        <ItemTitle><button type="button" className={done ? "touch-hit text-left text-muted-foreground line-through hover:underline" : "touch-hit text-left hover:underline"} onClick={(event) => onOpen(event.currentTarget)}>{assignment.title}</button></ItemTitle>
        <ItemDescription>
          {labelFor(MEDIA_TYPE_LABELS, assignment.type)} · {assignment.assignee?.name || "Unassigned"}{due ? <> · <span className={isOverdue(assignment.dueAt, timezone, now) ? "text-warning" : undefined}>{due}</span></> : null}
        </ItemDescription>
        {detail.some(Boolean) ? <ItemDescription><Meta parts={detail} flag={(index) => (files ? index > 0 : true)} /></ItemDescription> : null}
      </ItemContent>
      <ItemActions>
        <WorkStatusBadge kind="production" intensity={mediaIntensity(assignment.status)}>{labelFor(MEDIA_STATUS_LABELS, assignment.status)}</WorkStatusBadge>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit assignment: ${assignment.title}`} onClick={(event) => onOpen(event.currentTarget)}><Pencil /></Button>
      </ItemActions>
    </ContextMenuTrigger>
    <ContextMenuContent className="w-52">
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-48 truncate">{assignment.title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={(event) => onOpen(event.currentTarget as HTMLElement)}><Pencil aria-hidden="true" />Edit assignment</ContextMenuItem>
        {canUpdateStatus ? <ContextMenuSub>
          <ContextMenuSubTrigger disabled={busy}>Status</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            <ContextMenuRadioGroup value={assignment.status} onValueChange={(value) => { if (value && value !== assignment.status) onStatus(value as MediaAssignmentStatus); }}>
              {STATUS_OPTIONS.map((option) => <ContextMenuRadioItem key={option.value} value={option.value}>{option.label}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub> : null}
      </ContextMenuGroup>
    </ContextMenuContent>
  </ContextMenu>;
}

export function MediaSection() {
  const { storyId, client, data, timezone, now, caps, currentUserId, sectionError, reload, announce } = useWorkspace();
  const cache = useWorkspaceCache();
  const dialog = useDialogTarget<StoryMediaAssignment>("[data-ws-add=media]");
  const failed = sectionError("media");
  const quickStatus = useMutation({
    mutationFn: ({ assignment, status }: { assignment: StoryMediaAssignment; status: MediaAssignmentStatus }) => client.saveMediaAssignment(storyId, { status, expectedUpdatedAt: assignment.updatedAt }, assignment.id),
    onMutate: async ({ assignment, status }) => {
      await cache.cancel();
      const previous = cache.read();
      cache.write((current) => current ? { ...current, mediaAssignments: current.mediaAssignments.map((item) => item.id === assignment.id ? { ...item, status } : item) } : current);
      return { previous };
    },
    onSuccess: (response, { assignment, status }) => {
      cache.write((current) => applyMedia(current, response));
      const completed = status === "done";
      const message = completed ? `Marked ${assignment.title} done.` : `Reopened ${assignment.title}.`;
      announce(message);
      toast.success(message, {
        action: {
          label: "Undo",
          onClick: () => {
            void client.saveMediaAssignment(storyId, { status: assignment.status }, assignment.id).then((restored) => {
              cache.write((current) => applyMedia(current, restored));
              announce(`Restored ${assignment.title}.`);
              void cache.invalidate();
            }).catch((failure) => toast.error(workspaceError(failure, "The media status change couldn’t be undone.").message));
          }
        }
      });
    },
    onError: (failure, _variables, context) => { if (context?.previous) cache.write(() => context.previous); const message = workspaceError(failure, "Production status couldn’t be saved. Try again.").message; toast.error(message); announce(message); },
    onSettled: () => { void cache.invalidate(); }
  });
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
        ? <ItemGroup role="group" aria-label="Production assignments" className="gap-0">{data.mediaAssignments.map((assignment) => <MediaRow key={assignment.id} assignment={assignment} people={data.people} timezone={timezone} now={now} busy={quickStatus.isPending && quickStatus.variables?.assignment.id === assignment.id} canUpdateStatus={caps.manageMedia || assignment.assigneeId === currentUserId} onOpen={(element) => dialog.openWith(assignment, element)} onStatus={(status) => quickStatus.mutate({ assignment, status })} />)}</ItemGroup>
        : <div className="px-3"><Empty className="py-5"><EmptyHeader><EmptyTitle>No photo, graphic, video or audio work yet.</EmptyTitle></EmptyHeader>{add ? <EmptyContent>{add}</EmptyContent> : null}</Empty></div>}
    </CardContent>
    <MediaDialog key={`media-${dialog.session}`} open={dialog.open} assignment={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Card>;
}
