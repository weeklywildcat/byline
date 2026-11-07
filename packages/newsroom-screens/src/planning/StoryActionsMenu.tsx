import { ArrowRightLeft, ArrowUpRight, FilePen, FileText, MoreHorizontal, PanelRightOpen } from "lucide-react";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@byline/newsroom-ui/ui/context-menu";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useRef, type MouseEvent as ReactMouseEvent, type ReactElement } from "react";
import { movableWorkflowStatuses, type PlanningStory, type PlanningWorkflowStatus } from "../planning/planning-model";

export type StoryActionsMenuProps = {
  additionalActions?: Array<{ id: string; label: string; run: () => void }>;
  story: PlanningStory;
  statuses: PlanningWorkflowStatus[];
  /** Whether the viewer may move stories at all (the server decides; this keeps known-forbidden moves out of the menu). */
  canMove: boolean;
  disabled?: boolean;
  /** The same canonical workflow move drag-and-drop performs. */
  onMove: (story: PlanningStory, status: string) => void;
  workspaceUrl: (storyId: number) => string;
  className?: string;
};

/**
 * Where a story's menu can go. "Open story" is the host's Story screen (the
 * WordPress Story Workspace, the Payload Story screen). "Edit article" appears
 * only when the host edits the article somewhere else (Gutenberg); a host whose
 * Story screen is also its editor never shows two links to one place.
 * Preview appears only when the host has a real preview.
 */
export function storyDestinations(story: Pick<PlanningStory, "id" | "editUrl" | "previewUrl">, workspaceUrl: (storyId: number) => string) {
  const open = workspaceUrl(story.id);
  const sameAsOpen = (href: string) => {
    try {
      const base = typeof window === "undefined" ? "http://localhost/" : window.location.href;
      return new URL(href, base).href === new URL(open, base).href;
    } catch {
      return href === open;
    }
  };
  return {
    open,
    edit: story.editUrl && !sameAsOpen(story.editUrl) ? story.editUrl : null,
    preview: story.previewUrl || null
  };
}

/** Published comes from the publication state; it is never a stage to move to or from. Participants cannot move a story either. */
export const canMoveFromMenu = (story: PlanningStory, canMove: boolean) => canMove && story.canEditPlanning !== false && !story.publicationState.isPublished;

/**
 * Everything you can do with a story from a collection, as one menu: open it,
 * preview it, or move it to another workflow stage. Moving here is the
 * keyboard and touch equivalent of dragging a card.
 */
export function StoryActionsMenu({ story, statuses, canMove, disabled, onMove, workspaceUrl, className, additionalActions }: StoryActionsMenuProps) {
  const title = story.title || "Untitled story";
  const movable = canMoveFromMenu(story, canMove);
  const stages = movableWorkflowStatuses(statuses);
  const go = storyDestinations(story, workspaceUrl);
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={cn("shrink-0", className)} disabled={disabled} aria-label={`Actions for ${title}`} data-story-actions={story.id} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuGroup>
        <DropdownMenuItem render={<a href={go.open} />}><FileText aria-hidden="true" />Open story</DropdownMenuItem>
        {go.edit ? <DropdownMenuItem render={<a href={go.edit} />}><FilePen aria-hidden="true" />Edit article</DropdownMenuItem> : null}
        {go.preview ? <DropdownMenuItem render={<a href={go.preview} target="_blank" rel="noopener noreferrer" />}><ArrowUpRight aria-hidden="true" />Preview<span className="sr-only"> {"(opens in a new tab)"}</span></DropdownMenuItem> : null}
      </DropdownMenuGroup>
      {movable && stages.length ? <>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><ArrowRightLeft aria-hidden="true" />Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            <DropdownMenuRadioGroup value={story.workflow.id} onValueChange={(value) => { if (value && value !== story.workflow.id) onMove(story, String(value)); }}>
              {stages.map((stage) => <DropdownMenuRadioItem key={stage.id} value={stage.id}>{stage.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </> : null}
      {additionalActions?.map((a) => <DropdownMenuItem key={a.id} onClick={a.run}>{a.label}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}


export type StoryContextMenuProps = StoryActionsMenuProps & {
  onOpenStory: (storyId: number) => void;
  children: ReactElement;
};

/**
 * Pointer accelerator for Story List rows. It mirrors the visible three-dot
 * menu instead of replacing it, so touch and keyboard users keep the ordinary
 * action button while mouse/trackpad users can right-click anywhere on a row.
 */
export function StoryContextMenu({ story, statuses, canMove, disabled, onMove, workspaceUrl, onOpenStory, children, additionalActions }: StoryContextMenuProps) {
  const title = story.title || "Untitled story";
  const movable = canMoveFromMenu(story, canMove);
  const stages = movableWorkflowStatuses(statuses);
  const go = storyDestinations(story, workspaceUrl);
  // macOS Control-click is a secondary click even though the browser reports
  // the pointer button as primary. Base UI correctly opens the context menu on
  // the contextmenu event, but WebKit/Chromium can still dispatch a follow-up
  // click to the element underneath. Keep a short-lived guard so that follow-up
  // click cannot open Story Peek or navigate a nested control.
  const secondaryPressUntil = useRef(0);
  const markSecondaryPress = () => { secondaryPressUntil.current = performance.now() + 750; };
  const suppressSecondaryActivation = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.ctrlKey || event.button !== 0 || performance.now() < secondaryPressUntil.current) {
      event.preventDefault();
      event.stopPropagation();
      secondaryPressUntil.current = 0;
    }
  };

  return <ContextMenu>
    <ContextMenuTrigger
      render={children}
      onPointerDownCapture={(event) => {
        if (event.button === 2 || (event.button === 0 && event.ctrlKey)) markSecondaryPress();
      }}
      onContextMenuCapture={markSecondaryPress}
      onClickCapture={suppressSecondaryActivation}
      onAuxClickCapture={suppressSecondaryActivation}
    />
    <ContextMenuContent className="w-56">
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-52 truncate">{title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={disabled} onClick={() => onOpenStory(story.id)}><PanelRightOpen aria-hidden="true" />Quick view</ContextMenuItem>
        <ContextMenuItem render={<a href={go.open} />}><FileText aria-hidden="true" />Open story</ContextMenuItem>
        {go.edit ? <ContextMenuItem render={<a href={go.edit} />}><FilePen aria-hidden="true" />Edit article</ContextMenuItem> : null}
        {go.preview ? <ContextMenuItem render={<a href={go.preview} target="_blank" rel="noopener noreferrer" />}><ArrowUpRight aria-hidden="true" />Preview<span className="sr-only"> {"(opens in a new tab)"}</span></ContextMenuItem> : null}
      </ContextMenuGroup>
      {movable && stages.length ? <>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={disabled}><ArrowRightLeft aria-hidden="true" />Move to</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            <ContextMenuRadioGroup value={story.workflow.id} onValueChange={(value) => { if (value && value !== story.workflow.id) onMove(story, String(value)); }}>
              {stages.map((stage) => <ContextMenuRadioItem key={stage.id} value={stage.id}>{stage.label}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </> : null}
      {additionalActions?.map((a) => <ContextMenuItem key={a.id} onClick={a.run}>{a.label}</ContextMenuItem>)}
    </ContextMenuContent>
  </ContextMenu>;
}
