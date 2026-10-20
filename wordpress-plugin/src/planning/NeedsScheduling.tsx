import { useState } from "react";
import { CalendarClock, Eye } from "lucide-react";
import { __, sprintf } from "@wordpress/i18n";
import { decodeEntities } from "../admin-ui/lib/text";
import { Badge } from "../admin-ui/ui/badge";
import { WorkStatusBadge } from "../admin-ui/components/work-status-badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "../admin-ui/ui/context-menu";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import type { NeedsSchedulingItem } from "./calendar-model";
import { StoryTitleButton } from "../story/story-parts";
import { StoryHoverCard } from "../story/StoryHoverCard";

const PREVIEW = 5;

/**
 * Open appointments that have a target window or no date at all. They are never
 * placed on the calendar and never shown with a time; Schedule opens the
 * appointment's own editor in the Story Workspace, where an exact date is set.
 */
export function NeedsScheduling({ items, loading, onOpenStory }: { items: NeedsSchedulingItem[]; loading: boolean; onOpenStory: (storyId: number) => void }) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length && !loading) return null;
  const shown = showAll ? items : items.slice(0, PREVIEW);
  return <Card size="sm" role="region" aria-labelledby="needs-scheduling-title">
    <CardHeader>
      <CardTitle id="needs-scheduling-title">{__("Needs scheduling", "weekly-wildcat-headless")}</CardTitle>
      <CardAction><Badge variant="secondary">{items.length}</Badge></CardAction>
    </CardHeader>
    <CardContent className="px-0">
      {items.length
        ? <ItemGroup className="gap-0">{shown.map((item) => <ContextMenu key={item.id}>
          <ContextMenuTrigger render={<Item size="sm" />}>
            <ItemContent>
              <ItemTitle>{decodeEntities(item.title)}</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {item.storyId ? <StoryHoverCard storyId={item.storyId} title={item.storyTitle}><StoryTitleButton story={{ id: item.storyId, title: item.storyTitle }} onOpen={onOpenStory} className="font-normal" /></StoryHoverCard> : decodeEntities(item.storyTitle)}
                {" · "}<span className={item.hasTarget ? undefined : "text-muted-foreground"}>{item.target}</span>
                {" · "}{item.assigneeNames.length ? item.assigneeNames.join(", ") : __("Unassigned", "weekly-wildcat-headless")}
              </ItemDescription>
            </ItemContent>
            <ItemActions><WorkStatusBadge kind="reporting" intensity="action">{__("Needs scheduling", "weekly-wildcat-headless")}</WorkStatusBadge><a className={buttonVariants({ variant: "outline", size: "sm" })} href={item.href}>{__("Schedule", "weekly-wildcat-headless")}<span className="sr-only"> {item.title}</span></a></ItemActions>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuLabel className="max-w-48 truncate">{decodeEntities(item.title)}</ContextMenuLabel>
            <ContextMenuSeparator />
            {item.storyId ? <ContextMenuItem onClick={() => onOpenStory(item.storyId)}><Eye aria-hidden="true" />{__("Quick view story", "weekly-wildcat-headless")}</ContextMenuItem> : null}
            <ContextMenuItem render={<a href={item.href} />}><CalendarClock aria-hidden="true" />{__("Schedule appointment", "weekly-wildcat-headless")}</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>)}</ItemGroup>
        : <p className="px-3 pb-2 text-sm text-muted-foreground">{__("Checking for appointments that need a time…", "weekly-wildcat-headless")}</p>}
      {items.length > PREVIEW ? <div className="px-1.5 pt-1"><Button variant="link" size="sm" aria-expanded={showAll} onClick={() => setShowAll((current) => !current)}>{showAll ? __("Show fewer", "weekly-wildcat-headless") : sprintf(/* translators: %d: item count. */ __("Show all %d", "weekly-wildcat-headless"), items.length)}</Button></div> : null}
    </CardContent>
  </Card>;
}
