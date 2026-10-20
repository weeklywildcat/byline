import { ArrowRightLeft, ArrowUpRight, FilePen, LayoutDashboard, MoreHorizontal } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { Button } from "../admin-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { cn } from "../admin-ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../admin-ui/ui/tooltip";
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
    <Tooltip><TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={cn("shrink-0", className)} disabled={disabled} aria-label={`${__("Actions for", "weekly-wildcat-headless")} ${title}`} data-story-actions={story.id} />} />}><MoreHorizontal aria-hidden="true" /></TooltipTrigger><TooltipContent>{__("Story actions", "weekly-wildcat-headless")}</TooltipContent></Tooltip>
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
