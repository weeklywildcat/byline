import { ArrowRightLeft, ArrowUpRight, FilePen, LayoutDashboard, MoreHorizontal, PanelRightOpen } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { Button } from "../admin-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "../admin-ui/ui/context-menu";
import { cn } from "../admin-ui/lib/utils";
import { useRef, type MouseEvent as ReactMouseEvent, type ReactElement } from "react";
import { movableWorkflowStatuses, type PlanningStory, type PlanningWorkflowStatus } from "./planning-model";

export type StoryActionsMenuProps = {
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
 * Everything you can do with a story from a collection, as one menu: go deeper
 * (workspace, article, preview) or move it to another workflow stage. Moving
 * here is the keyboard and touch equivalent of dragging a card.
 */
export function StoryActionsMenu({ story, statuses, canMove, disabled, onMove, workspaceUrl, className }: StoryActionsMenuProps) {
  const title = story.title || __("Untitled story", "weekly-wildcat-headless");
  // Published is derived from WordPress; it is never a stage to move to or from.
  const movable = canMove && !story.wordpressState.isPublished;
  const stages = movableWorkflowStatuses(statuses);
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={cn("shrink-0", className)} disabled={disabled} aria-label={`${__("Actions for", "weekly-wildcat-headless")} ${title}`} data-story-actions={story.id} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuGroup>
        <DropdownMenuItem render={<a href={workspaceUrl(story.id)} />}><LayoutDashboard aria-hidden="true" />{__("Open workspace", "weekly-wildcat-headless")}</DropdownMenuItem>
        {story.editUrl ? <DropdownMenuItem render={<a href={story.editUrl} />}><FilePen aria-hidden="true" />{__("Edit article", "weekly-wildcat-headless")}</DropdownMenuItem> : null}
        {story.previewUrl ? <DropdownMenuItem render={<a href={story.previewUrl} target="_blank" rel="noopener noreferrer" />}><ArrowUpRight aria-hidden="true" />{__("Preview", "weekly-wildcat-headless")}<span className="sr-only"> {__("(opens in a new tab)", "weekly-wildcat-headless")}</span></DropdownMenuItem> : null}
      </DropdownMenuGroup>
      {movable && stages.length ? <>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><ArrowRightLeft aria-hidden="true" />{__("Move to", "weekly-wildcat-headless")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            <DropdownMenuRadioGroup value={story.workflow.id} onValueChange={(value) => { if (value && value !== story.workflow.id) onMove(story, String(value)); }}>
              {stages.map((stage) => <DropdownMenuRadioItem key={stage.id} value={stage.id}>{stage.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </> : null}
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
export function StoryContextMenu({ story, statuses, canMove, disabled, onMove, workspaceUrl, onOpenStory, children }: StoryContextMenuProps) {
  const title = story.title || __("Untitled story", "weekly-wildcat-headless");
  const movable = canMove && !story.wordpressState.isPublished;
  const stages = movableWorkflowStatuses(statuses);
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
        <ContextMenuItem disabled={disabled} onClick={() => onOpenStory(story.id)}><PanelRightOpen aria-hidden="true" />{__("Quick view", "weekly-wildcat-headless")}</ContextMenuItem>
        <ContextMenuItem render={<a href={workspaceUrl(story.id)} />}><LayoutDashboard aria-hidden="true" />{__("Open workspace", "weekly-wildcat-headless")}</ContextMenuItem>
        {story.editUrl ? <ContextMenuItem render={<a href={story.editUrl} />}><FilePen aria-hidden="true" />{__("Edit article", "weekly-wildcat-headless")}</ContextMenuItem> : null}
        {story.previewUrl ? <ContextMenuItem render={<a href={story.previewUrl} target="_blank" rel="noopener noreferrer" />}><ArrowUpRight aria-hidden="true" />{__("Preview", "weekly-wildcat-headless")}<span className="sr-only"> {__("(opens in a new tab)", "weekly-wildcat-headless")}</span></ContextMenuItem> : null}
      </ContextMenuGroup>
      {movable && stages.length ? <>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={disabled}><ArrowRightLeft aria-hidden="true" />{__("Move to", "weekly-wildcat-headless")}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            <ContextMenuRadioGroup value={story.workflow.id} onValueChange={(value) => { if (value && value !== story.workflow.id) onMove(story, String(value)); }}>
              {stages.map((stage) => <ContextMenuRadioItem key={stage.id} value={stage.id}>{stage.label}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </> : null}
    </ContextMenuContent>
  </ContextMenu>;
}
