import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ItemButton } from "../admin-ui/components/item-button";
import { PeopleAvatars, anyPicture } from "../admin-ui/components/people-avatars";
import { WorkStatusBadge, mediaIntensity } from "../admin-ui/components/work-status-badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "../admin-ui/ui/context-menu";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
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

function MediaRow({ assignment, people, timezone, now, onOpen, onStatus, busy }: { assignment: StoryMediaAssignment; people: ContributorEntry[]; timezone: string; now: Date; onOpen: (element: HTMLElement) => void; onStatus: (status: MediaAssignmentStatus) => void; busy: boolean }) {
  const Icon = mediaTypeIcons[assignment.type] || mediaTypeIcons.other;
  const done = assignment.status === "done";
  const due = done ? "" : dueText(assignment.dueAt, timezone, now);
  const files = assignment.attachmentIds.length;
  const hints = mediaReadinessHints(assignment);
  const detail = [files ? fileCountLabel(files) : "", ...hints];
  return <ContextMenu>
    <ContextMenuTrigger render={<div className="contents" />}><ItemButton size="sm" onClick={(event) => onOpen(event.currentTarget)}>

    {assignment.assignee && anyPicture(assigneeAvatars([assignment.assignee], people)) ? <ItemMedia><PeopleAvatars people={assigneeAvatars([assignment.assignee], people)} /></ItemMedia> : <ItemMedia variant="icon" className="size-6 rounded-full bg-muted text-muted-foreground"><Icon aria-hidden="true" /></ItemMedia>}
    <ItemContent>
      <ItemTitle>{assignment.title}</ItemTitle>
      <ItemDescription>
        {labelFor(MEDIA_TYPE_LABELS, assignment.type)} · {assignment.assignee?.name || "Unassigned"}{due ? <> · <span className={isOverdue(assignment.dueAt, timezone, now) ? "text-warning" : undefined}>{due}</span></> : null}
      </ItemDescription>
      {detail.some(Boolean) ? <ItemDescription><Meta parts={detail} flag={(index) => (files ? index > 0 : true)} /></ItemDescription> : null}
    </ItemContent>
    <ItemActions>
      <WorkStatusBadge kind="production" intensity={mediaIntensity(assignment.status)}>{labelFor(MEDIA_STATUS_LABELS, assignment.status)}</WorkStatusBadge>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </ItemActions>

    </ItemButton></ContextMenuTrigger>
    <ContextMenuContent className="w-52">
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-48 truncate">{assignment.title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={(event) => onOpen(event.currentTarget as HTMLElement)}><Pencil aria-hidden="true" />Edit assignment</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={busy}>Status</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            <ContextMenuRadioGroup value={assignment.status} onValueChange={(value) => { if (value && value !== assignment.status) onStatus(value as MediaAssignmentStatus); }}>
              {STATUS_OPTIONS.map((option) => <ContextMenuRadioItem key={option.value} value={option.value}>{option.label}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuGroup>
    </ContextMenuContent>
  </ContextMenu>;
}

export function MediaSection() {
  const { storyId, client, data, timezone, now, caps, sectionError, reload, announce } = useWorkspace();
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
    onSuccess: (response) => { cache.write((current) => applyMedia(current, response)); announce("Production status updated."); },
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
        ? <ItemGroup role="group" aria-label="Production assignments" className="gap-0">{data.mediaAssignments.map((assignment) => <MediaRow key={assignment.id} assignment={assignment} people={data.people} timezone={timezone} now={now} busy={quickStatus.isPending && quickStatus.variables?.assignment.id === assignment.id} onOpen={(element) => dialog.openWith(assignment, element)} onStatus={(status) => quickStatus.mutate({ assignment, status })} />)}</ItemGroup>
        : <div className="px-3"><Empty className="py-5"><EmptyHeader><EmptyTitle>No photo, graphic, video or audio work yet.</EmptyTitle></EmptyHeader>{add ? <EmptyContent>{add}</EmptyContent> : null}</Empty></div>}
    </CardContent>
    <MediaDialog key={`media-${dialog.session}`} open={dialog.open} assignment={dialog.target} onClose={dialog.close} finalFocus={dialog.finalFocus} />
  </Card>;
}
