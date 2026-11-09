"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { PersonAvatar } from "@byline/newsroom-ui/components/person-avatar";
import { MoreHorizontal, Pin } from "lucide-react";
import type { ReactNode } from "react";
import type { LiveDeskUpdate } from "../../newsroom/live-coverage";

export function liveTime(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export type TimelineControls = {
  /** May this person change this update at all? (Editors and direct publishers: any; staff: their own drafts.) */
  canChange: (update: LiveDeskUpdate) => boolean;
  /** May publish, unpublish and pin. */
  canPublish: boolean;
  busy: boolean;
  editingId: number | null;
  renderEditor: (update: LiveDeskUpdate) => ReactNode;
  onEdit: (update: LiveDeskUpdate) => void;
  onPublish: (update: LiveDeskUpdate) => void;
  onPin: (update: LiveDeskUpdate) => void;
  onDelete: (update: LiveDeskUpdate) => void;
};

/**
 * One row per live update: time, author, headline and text, photo, and its state in words (Published, or
 * Draft · at desk) plus key-update state, never by color alone. Secondary actions are a menu. Newest first.
 */
export function LiveTimeline({ updates, timeZone, storyPublished, controls, tap }: { updates: LiveDeskUpdate[]; timeZone: string; storyPublished: boolean; controls?: TimelineControls; tap?: boolean }) {
  if (!updates.length) return <p className="py-6 text-center text-sm text-muted-foreground">No live updates yet.</p>;
  return (
    <ItemGroup aria-label="Live updates, newest first" className="gap-2" role="list">
      {updates.map((update) => {
        const editing = controls?.editingId === update.id;
        const allowed = controls?.canChange(update) === true;
        return (
          <Item key={update.id} variant="outline" size="sm" role="listitem" data-live-update={update.state} className="items-start">
            <ItemContent className="min-w-0 gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <time dateTime={update.publishedAt} className="tabular-nums">{liveTime(update.publishedAt, timeZone)}</time>
                {update.author ? <span className="flex items-center gap-1.5"><PersonAvatar name={update.author.name} url={update.author.avatarUrl} size="sm" /><span className="font-medium text-foreground">{update.author.name}</span></span> : null}
                {update.state === "published"
                  ? <Badge variant="secondary">{storyPublished ? "Published" : "Ready · story not published"}</Badge>
                  : <Badge variant="outline">Draft · at desk</Badge>}
                {update.pinned ? <Badge variant="secondary"><Pin data-icon="inline-start" aria-hidden="true" />Key update</Badge> : null}
              </div>
              {editing ? controls!.renderEditor(update) : (
                <>
                  {update.title ? <ItemTitle className="line-clamp-none text-base">{update.title}</ItemTitle> : null}
                  <ItemDescription className="line-clamp-none whitespace-pre-wrap text-foreground">{update.text}</ItemDescription>
                  {update.photo?.previewUrl ? <img src={update.photo.previewUrl} alt={update.photo.alt} className="max-h-56 w-fit max-w-full rounded-md object-cover" /> : null}
                </>
              )}
            </ItemContent>
            {controls && allowed && !editing ? (
              <ItemActions>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" className={tap ? "size-11" : undefined} aria-label={`Actions for the update at ${liveTime(update.publishedAt, timeZone)}`} disabled={controls.busy} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => controls.onEdit(update)}>Edit</DropdownMenuItem>
                    {controls.canPublish ? <DropdownMenuItem onClick={() => controls.onPublish(update)}>{update.state === "draft" ? "Publish" : "Unpublish"}</DropdownMenuItem> : null}
                    {controls.canPublish && update.state === "published" ? <DropdownMenuItem onClick={() => controls.onPin(update)}>{update.pinned ? "Unpin" : "Pin as key update"}</DropdownMenuItem> : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => controls.onDelete(update)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ItemActions>
            ) : null}
          </Item>
        );
      })}
    </ItemGroup>
  );
}
