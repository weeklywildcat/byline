import { useState } from "react";
import { CalendarClock, Eye } from "lucide-react";
import { decodeEntities } from "@byline/newsroom-ui/lib/text";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { WorkStatusBadge } from "@byline/newsroom-ui/components/work-status-badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@byline/newsroom-ui/ui/context-menu";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import type { NeedsSchedulingItem } from "./calendar-model";
import { StoryTitleButton } from "../story/story-parts";
import { StoryHoverCard } from "../story/StoryHoverCard";
import { CalendarLink } from "./calendar-link";

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
      <CardTitle id="needs-scheduling-title">Needs scheduling</CardTitle>
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
                {" · "}{item.assigneeNames.length ? item.assigneeNames.join(", ") : "Unassigned"}
              </ItemDescription>
            </ItemContent>
            <ItemActions><WorkStatusBadge kind="reporting" intensity="action">Needs scheduling</WorkStatusBadge><CalendarLink className={buttonVariants({ variant: "outline", size: "sm" })} href={item.href}>Schedule<span className="sr-only"> {item.title}</span></CalendarLink></ItemActions>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuGroup>
              <ContextMenuLabel className="max-w-48 truncate">{decodeEntities(item.title)}</ContextMenuLabel>
              <ContextMenuSeparator />
              {item.storyId ? <ContextMenuItem onClick={() => onOpenStory(item.storyId)}><Eye aria-hidden="true" />Quick view story</ContextMenuItem> : null}
              <ContextMenuItem render={<CalendarLink href={item.href} />}><CalendarClock aria-hidden="true" />Schedule appointment</ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>)}</ItemGroup>
        : <p className="px-3 pb-2 text-sm text-muted-foreground">Checking for appointments that need a time…</p>}
      {items.length > PREVIEW ? <div className="px-1.5 pt-1"><Button variant="link" size="sm" aria-expanded={showAll} onClick={() => setShowAll((current) => !current)}>{showAll ? "Show fewer" : `Show all ${items.length}`}</Button></div> : null}
    </CardContent>
  </Card>;
}
