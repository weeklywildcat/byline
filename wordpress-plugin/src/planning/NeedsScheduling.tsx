import { useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { decodeEntities } from "../admin-ui/lib/text";
import { Badge } from "../admin-ui/ui/badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import type { NeedsSchedulingItem } from "./calendar-model";

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
        ? <ItemGroup className="gap-0">{shown.map((item) => <Item key={item.id} size="sm">
          {item.assigneeNames.length ? <ItemMedia><PeopleAvatars people={item.assigneeNames.map((name) => ({ name }))} /></ItemMedia> : null}
          <ItemContent>
            <ItemTitle>{decodeEntities(item.title)}</ItemTitle>
            <ItemDescription className="line-clamp-none">
              {item.storyId ? <button type="button" className="hover:underline" onClick={() => onOpenStory(item.storyId)}>{decodeEntities(item.storyTitle)}</button> : decodeEntities(item.storyTitle)}
              {" · "}<span className={item.hasTarget ? undefined : "text-muted-foreground"}>{item.target}</span>
              {item.assigneeNames.length ? null : <> · {__("Unassigned", "weekly-wildcat-headless")}</>}
            </ItemDescription>
          </ItemContent>
          <ItemActions><a className={buttonVariants({ variant: "outline", size: "sm" })} href={item.href}>{__("Schedule", "weekly-wildcat-headless")}<span className="sr-only"> {item.title}</span></a></ItemActions>
        </Item>)}</ItemGroup>
        : <p className="px-3 pb-2 text-sm text-muted-foreground">{__("Checking for appointments that need a time…", "weekly-wildcat-headless")}</p>}
      {items.length > PREVIEW ? <div className="px-1.5 pt-1"><Button variant="link" size="sm" aria-expanded={showAll} onClick={() => setShowAll((current) => !current)}>{showAll ? __("Show fewer", "weekly-wildcat-headless") : sprintf(/* translators: %d: item count. */ __("Show all %d", "weekly-wildcat-headless"), items.length)}</Button></div> : null}
    </CardContent>
  </Card>;
}
