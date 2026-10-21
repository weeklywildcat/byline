import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MessageSquareText } from "lucide-react";
import { decodeEntities } from "../admin-ui/lib/text";
import { Avatar, AvatarFallback, AvatarImage } from "../admin-ui/ui/avatar";
import { Badge } from "../admin-ui/ui/badge";
import { buttonVariants } from "../admin-ui/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Skeleton } from "../admin-ui/ui/skeleton";
import { exactDate, relativeTime } from "../home/newsroom-model";
import { NOTES_PREVIEW_LIMIT, initials, moreOpenNotesLabel, repliesLabel, resolvedNotesLabel, visibleNotes, type ArticleNotePreview, type ArticleNotesSummary } from "../story/notes-model";
import { SectionFailed } from "./parts";
import { useWorkspace } from "./workspace-context";
import { articleNotesKey } from "./workspace-query";

/**
 * Where unresolved copy feedback exists, at a glance. WordPress Core Notes stay
 * in Gutenberg; this card only summarises them and opens the real editor. It is
 * omitted entirely for anyone who may see the workspace but not edit the story.
 */
export function NotesSection() {
  const { storyId, client, data, timezone, now } = useWorkspace();
  const summary = visibleNotes(data.story.notes);
  const previews = useQuery({
    queryKey: articleNotesKey(storyId),
    queryFn: () => client.getNotes(storyId, NOTES_PREVIEW_LIMIT),
    // Loaded lazily, and only when there is something to preview.
    enabled: Boolean(summary && summary.openCount > 0)
  });
  if (!summary) return null;
  // The preview response is the freshest read; the workspace summary is the fallback.
  const current = visibleNotes(previews.data?.summary) ?? summary;
  const status = current.openCount === 0 ? "ready" : previews.isError ? "error" : previews.isPending ? "loading" : "ready";
  return <ArticleNotesCard summary={current} fallbackEditUrl={summary.editUrl} notes={previews.data?.open ?? []} status={status} onRetry={() => void previews.refetch()} timezone={timezone} now={now} />;
}

export type ArticleNotesCardProps = {
  summary: ArticleNotesSummary;
  fallbackEditUrl?: string;
  notes: ArticleNotePreview[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  timezone: string;
  now: Date;
};

/** The presentation only: counts, up to three open threads, and the way into the editor. */
export function ArticleNotesCard({ summary, fallbackEditUrl = "", notes, status, onRetry, timezone, now }: ArticleNotesCardProps) {
  const open = summary.openCount;
  const more = status === "ready" ? moreOpenNotesLabel(open, notes.length) : null;
  const editUrl = summary.editUrl || fallbackEditUrl;
  return <Card size="sm" role="region" aria-labelledby="ws-notes-title" id="ws-notes" className="order-3 lg:order-none">
    <CardHeader>
      <CardTitle id="ws-notes-title" role="heading" aria-level={2} className="flex min-w-0 items-center gap-2"><MessageSquareText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />Article Notes</CardTitle>
      {open > 0 ? <CardAction><Badge variant="secondary">{open} open</Badge></CardAction> : null}
    </CardHeader>
    <CardContent className="px-0">
      {open === 0
        ? <div className="px-3"><Empty className="gap-2 p-3 py-4">
          <EmptyHeader className="gap-1"><EmptyTitle>No open article notes</EmptyTitle><EmptyDescription>Copy-editing comments and suggestions will appear here.</EmptyDescription></EmptyHeader>
        </Empty></div>
        : status === "error"
          ? <div className="px-3"><SectionFailed what="article notes" onRetry={onRetry} /></div>
          : status === "loading"
            ? <div role="status" aria-label="Loading article notes" className="flex flex-col gap-3 px-3">{Array.from({ length: Math.min(open, NOTES_PREVIEW_LIMIT) }, (_, index) => <div key={index} className="flex items-start gap-2"><Skeleton className="size-6 shrink-0 rounded-full" /><div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3.5 w-full" /></div></div>)}</div>
            : <ItemGroup role="list" aria-label="Open article notes" className="gap-0">{notes.map((note) => <NoteRow key={note.id} note={note} timezone={timezone} now={now} />)}</ItemGroup>}
      {more || summary.resolvedCount > 0 ? <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pt-2 text-xs text-muted-foreground">
        {more ? <span>{more}</span> : <span />}
        {summary.resolvedCount > 0 ? <span>{resolvedNotesLabel(summary.resolvedCount)}</span> : null}
      </p> : null}
    </CardContent>
    {editUrl ? <CardFooter>
      {/* WordPress documents no deep link to the Notes panel, so this opens the editor itself. */}
      <a className={buttonVariants({ variant: "outline", className: "w-full" })} href={editUrl} target="_blank" rel="noopener noreferrer">
        {open > 0 ? "Review notes in editor" : "Open article in editor"}<ArrowUpRight data-icon="inline-end" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
      </a>
    </CardFooter> : null}
  </Card>;
}

function NoteRow({ note, timezone, now }: { note: ArticleNotePreview; timezone: string; now: Date }) {
  const name = decodeEntities(note.author.name) || "Unknown author";
  const when = note.updatedAt || note.createdAt;
  return <Item role="listitem" size="sm" className="items-start">
    <ItemMedia>
      <Avatar size="sm"><AvatarImage src={note.author.avatarUrl || undefined} alt="" /><AvatarFallback aria-hidden="true">{initials(name)}</AvatarFallback></Avatar>
    </ItemMedia>
    <ItemContent>
      <ItemTitle className="w-full min-w-0 justify-between gap-2">
        <span className="truncate">{name}</span>
        <time className="shrink-0 text-xs font-normal text-muted-foreground" dateTime={when} title={exactDate(when, timezone)}>{relativeTime(when, timezone, now)}</time>
      </ItemTitle>
      <ItemDescription className="line-clamp-2 [overflow-wrap:anywhere]">{note.excerpt || "Note with no text"}</ItemDescription>
      {note.replyCount > 0 ? <span className="text-xs text-muted-foreground">{repliesLabel(note.replyCount)}</span> : null}
    </ItemContent>
  </Item>;
}
