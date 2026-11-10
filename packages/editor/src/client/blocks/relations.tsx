"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, DEFAULT_HEADINGS, type MediaId } from "@byline/article-body";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ArticleImage, EventView, formatEventWhen, PollBlockView, RelatedCoverageView } from "@byline/ui/article-body";
import { ArrowDown, ArrowUp, Plus, Replace, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { newRowId } from "../../fields";
import { insertItem, moveItem, removeItem } from "../../items";
import { BlockShell, SettingsSurface, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useBylineEditorHost, useEventChoice, usePollChoice, useStoryChoice, type EventChoice, type PollChoice, type StoryChoice } from "../host";
import { BlockIcon } from "../icons";
import { useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

const formatDate = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

/** A debounced, cancellable search: each keystroke supersedes the last, and a stale answer is never shown. */
export function useSearch<T>(search: ((query: string) => Promise<T[]>) | undefined, query: string, open: boolean, attempt = 0) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; failed: boolean }>({ items: [], loading: false, failed: false });
  useEffect(() => {
    if (!open || !search) return;
    let live = true;
    setState((current) => ({ ...current, loading: true, failed: false }));
    const timer = window.setTimeout(() => {
      search(query).then(
        (items) => live && setState({ items, loading: false, failed: false }),
        () => live && setState({ items: [], loading: false, failed: true })
      );
    }, query ? 200 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [open, query, search, attempt]);
  return state;
}

/** One published story as a picker row. */
function StoryRow({ story, onSelect }: { story: StoryChoice; onSelect: () => void }) {
  return (
    <CommandItem value={String(story.id)} onSelect={onSelect} className="items-start gap-3 py-2">
      {story.thumbnailAsset ? <img src={story.thumbnailAsset.previewSrc ?? story.thumbnailAsset.src} alt="" className="size-10 shrink-0 object-cover" /> : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{story.headline}</span>
        <span className="text-xs text-muted-foreground">{[story.section, formatDate(story.publishedAt)].filter(Boolean).join(" · ")}</span>
      </span>
    </CommandItem>
  );
}

/**
 * Published Stories to link: Suggested (ranked by Byline's own related-story
 * rules for this story) and Search (by headline). Choosing either writes the
 * same ordinary Story relationship; nothing is ever added without a choice.
 * Never offers the story being edited or one already chosen.
 */
function StoryPicker({ onChoose, taken, trigger, title }: { onChoose: (story: StoryChoice) => void; taken: readonly string[]; trigger: React.ReactElement; title: string }) {
  const { searchStories, suggestStories, stories } = useBylineEditorHost();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>(suggestStories ? "suggested" : "search");
  const searched = useSearch(searchStories, query, open && tab === "search");
  const suggested = useSearch(suggestStories, "", open && tab === "suggested");
  const available = (items: StoryChoice[]) => items.filter((story) => !taken.includes(String(story.id)));
  const choose = (story: StoryChoice) => {
    stories.prime([{ id: story.id, value: story }]);
    onChoose(story);
    setOpen(false);
    setQuery("");
  };
  const status = (state: { loading: boolean; failed: boolean }, empty: string) => (
    <>
      {state.loading ? <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Spinner />{tab === "search" ? "Searching…" : "Finding related stories…"}</div> : null}
      {state.failed ? <div className="p-3 text-sm" role="alert">That did not finish. Try again.</div> : null}
      {!state.loading && !state.failed ? <CommandEmpty>{empty}</CommandEmpty> : null}
    </>
  );
  const search = (
    <Command shouldFilter={false} loop className="byline-inserter">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search by headline" aria-label="Search published stories" />
      <CommandList className="max-h-[min(50dvh,22rem)]">
        {status(searched, "No published story matches.")}
        <CommandGroup>{available(searched.items).map((story) => <StoryRow key={String(story.id)} story={story} onSelect={() => choose(story)} />)}</CommandGroup>
      </CommandList>
    </Command>
  );
  return (
    <SettingsSurface open={open} onOpenChange={setOpen} title={title} description="Published stories only. Nothing is added until you choose it." trigger={trigger}>
      {suggestStories ? (
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList className="w-full">
            <TabsTrigger value="suggested">Suggested</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
          </TabsList>
          <TabsContent value="suggested">
            <Command loop className="byline-inserter">
              <CommandList className="max-h-[min(50dvh,22rem)]" aria-label="Suggested stories">
                {status(suggested, "No related published stories yet. Search instead.")}
                <CommandGroup>{available(suggested.items).map((story) => <StoryRow key={String(story.id)} story={story} onSelect={() => choose(story)} />)}</CommandGroup>
              </CommandList>
            </Command>
          </TabsContent>
          <TabsContent value="search">{search}</TabsContent>
        </Tabs>
      ) : search}
    </SettingsSurface>
  );
}

function RelatedItem({ story: id, taken, readOnly, index, count, onChoose, onMove, onRemove }: { story: MediaId | null; taken: readonly string[]; readOnly: boolean; index: number; count: number; onChoose: (story: StoryChoice) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const entry = useStoryChoice(id);
  const story = entry.asset;
  const name = `story ${index + 1} of ${count}`;
  return (
    <li className="byline-related-item" data-related-index={index}>
      {id === null ? (
        <div className="byline-related-empty" data-byline-chrome="" contentEditable={false}>
          {readOnly ? <span>No story chosen.</span> : (
            <StoryPicker title="Choose a story" taken={taken} onChoose={onChoose} trigger={<Button type="button" variant="outline" size="sm"><Plus />Choose a published story</Button>} />
          )}
        </div>
      ) : story ? (
        <a href={story.href} onClick={(event) => event.preventDefault()} tabIndex={-1}>
          {story.thumbnailAsset ? <span className="byline-related-thumb"><ArticleImage asset={{ ...story.thumbnailAsset, src: story.thumbnailAsset.previewSrc ?? story.thumbnailAsset.src }} alt="" sizes="96px" /></span> : null}
          <span className="byline-related-text">
            <span className="byline-related-meta">
              {story.section ? <span>{story.section}</span> : null}
              <time dateTime={story.publishedAt}>{formatDate(story.publishedAt)}</time>
            </span>
            <span className="byline-related-headline">{story.headline}</span>
          </span>
        </a>
      ) : (
        <div className="byline-media-status" data-status={entry.status} role={entry.status === "missing" ? "alert" : undefined}>
          {entry.status === "loading" ? <Spinner /> : null}
          <span>{entry.status === "loading" ? "Loading…" : "This story is not published, or is gone. Choose another."}</span>
        </div>
      )}
      {readOnly ? null : (
        <ButtonGroup className="byline-row-actions" aria-label={`Actions for ${name}`} data-byline-chrome="">
          <ToolButton label="Move earlier" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></ToolButton>
          <ToolButton label="Move later" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown /></ToolButton>
          {id !== null ? (
            <StoryPicker title="Replace the story" taken={taken} onChoose={onChoose} trigger={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Replace ${name}`}><Replace /></Button>} />
          ) : null}
          <ToolButton label={`Remove ${name}`} onClick={onRemove}><Trash2 /></ToolButton>
        </ButtonGroup>
      )}
    </li>
  );
}

export function RelatedCoverageEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("relatedCoverage", node);
  const issues = useReadiness("relatedCoverage", id, node.fields);
  const announce = useAnnounce();
  const heading = useFocusTarget(nodeKey);
  const readOnly = !node.editable;
  const items = fields.stories;
  const full = items.length >= LIMITS.relatedMax;
  const taken = items.map((item) => (item.story === null ? "" : String(item.story))).filter(Boolean);
  const choose = (rowId: string, story: StoryChoice) => {
    if (taken.includes(String(story.id))) return;
    set({ stories: items.map((row) => (row.id === rowId ? { ...row, story: story.id } : row)) });
    announce(`${story.headline} added.`);
  };

  return (
    <BlockShell
      type="relatedCoverage"
      node={node}
      issues={issues}
      actions={<ButtonGroup><ToolTextButton label="Add story" icon={<Plus />} disabled={full} onClick={() => set({ stories: insertItem(items, items.length, { id: newRowId(), story: null }, LIMITS.relatedMax).items })} /></ButtonGroup>}
    >
      <RelatedCoverageView headingId={`${id}-heading`} heading={<InlineText inputRef={heading} label="Heading" placeholder={DEFAULT_HEADINGS.relatedCoverage} value={fields.heading} maxLength={LIMITS.heading} readOnly={readOnly} onChange={(value) => set({ heading: value })} />}>
        {items.map((item, index) => (
          <RelatedItem
            key={item.id}
            story={item.story}
            taken={taken}
            readOnly={readOnly}
            index={index}
            count={items.length}
            onChoose={(story) => choose(item.id, story)}
            onMove={(direction) => {
              const change = moveItem(items, index, direction);
              if (change.focus !== index) {
                set({ stories: change.items });
                announce(`Story moved to position ${change.focus + 1} of ${items.length}.`);
              }
            }}
            onRemove={() => {
              set({ stories: removeItem(items, index, () => ({ id: newRowId(), story: null })).items });
              announce("Story removed.");
            }}
          />
        ))}
      </RelatedCoverageView>
    </BlockShell>
  );
}

import { useRef } from "react";
function useFocusTarget(nodeKey: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, ref);
  return ref;
}

/** A searchable list of Polls a writer may place: open or closed, never a draft. */
function PollPicker({ onChoose, trigger }: { onChoose: (poll: PollChoice) => void; trigger: React.ReactElement }) {
  const { searchPolls, polls } = useBylineEditorHost();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { items, loading, failed } = useSearch(searchPolls, query, open);
  return (
    <SettingsSurface open={open} onOpenChange={setOpen} title="Choose a poll" description="Open and closed polls from the Polls list." trigger={trigger}>
      <Command shouldFilter={false} loop className="byline-inserter">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search by question" aria-label="Search polls" />
        <CommandList className="max-h-[min(50dvh,22rem)]">
          {loading ? <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Spinner />Searching…</div> : null}
          {failed ? <div className="p-3 text-sm" role="alert">The search did not finish. Try again.</div> : null}
          {!loading && !failed ? <CommandEmpty>No public poll matches.</CommandEmpty> : null}
          <CommandGroup>
            {items.map((poll) => (
              <CommandItem key={poll.id} value={String(poll.id)} onSelect={() => {
                polls.prime([{ id: poll.id, value: poll }]);
                onChoose(poll);
                setOpen(false);
                setQuery("");
              }} className="items-start gap-3 py-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{poll.question}</span>
                  <span className="text-xs text-muted-foreground">{poll.status === "open" ? "Open" : "Closed"} · {poll.options.length} answers</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </SettingsSurface>
  );
}

/**
 * Poll: the real public-safe definition, chosen from Polls. The question and
 * answers are never copied into the article; the block stores only the
 * relationship.
 */
export function PollEditor({ node, id }: BlockEditorProps) {
  const [fields, set] = useTypedFields("poll", node);
  const issues = useReadiness("poll", id, node.fields);
  const announce = useAnnounce();
  const entry = usePollChoice(fields.poll);
  const readOnly = !node.editable;
  const poll = entry.asset;
  const choose = (chosen: PollChoice) => {
    set({ poll: chosen.id });
    announce("Poll chosen.");
  };
  return (
    <BlockShell
      type="poll"
      node={node}
      issues={issues}
      actions={fields.poll !== null ? <PollPicker onChoose={choose} trigger={<Button type="button" variant="ghost" size="sm"><Replace />Replace poll</Button>} /> : null}
    >
      {fields.poll === null ? (
        <Empty className="byline-media-empty" data-byline-chrome="" contentEditable={false}>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BlockIcon icon="poll" /></EmptyMedia>
            <EmptyTitle>Choose a poll</EmptyTitle>
            <EmptyDescription>Pick one from the Polls list. Its question and answers come from there.</EmptyDescription>
          </EmptyHeader>
          {readOnly ? null : <PollPicker onChoose={choose} trigger={<Button type="button" size="sm">Choose a poll</Button>} />}
        </Empty>
      ) : poll ? (
        <>
          <PollBlockView blockId={id} poll={poll} />
          {poll.status === "draft" ? <Badge variant="outline">Draft poll</Badge> : null}
        </>
      ) : (
        <div className="byline-media-status" data-status={entry.status} role={entry.status === "missing" ? "alert" : undefined}>
          {entry.status === "loading" ? <Spinner /> : null}
          <span>{entry.status === "loading" ? "Loading…" : "This poll is gone. Choose another."}</span>
        </div>
      )}
    </BlockShell>
  );
}


/** A searchable list of published Events. Each row: the title, then when and where. */
function EventPicker({ onChoose, trigger, title }: { onChoose: (event: EventChoice) => void; trigger: React.ReactElement; title: string }) {
  const { searchEvents, events, timeZone, locale } = useBylineEditorHost();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { items, loading, failed } = useSearch(searchEvents, query, open);
  return (
    <SettingsSurface open={open} onOpenChange={setOpen} title={title} description="Published school and community events." trigger={trigger}>
      <Command shouldFilter={false} loop className="byline-inserter">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search by event name" aria-label="Search published events" />
        <CommandList className="max-h-[min(50dvh,22rem)]">
          {loading ? <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Spinner />Searching…</div> : null}
          {failed ? <div className="p-3 text-sm" role="alert">The search did not finish. Try again.</div> : null}
          {!loading && !failed ? <CommandEmpty>No published event matches.</CommandEmpty> : null}
          <CommandGroup>
            {items.map((event) => (
              <CommandItem key={String(event.id)} value={String(event.id)} onSelect={() => {
                events.prime([{ id: event.id, value: event }]);
                onChoose(event);
                setOpen(false);
                setQuery("");
              }} className="items-start gap-3 py-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{event.title}{event.eventStatus === "canceled" ? " (canceled)" : ""}</span>
                  <span className="text-xs text-muted-foreground">{[formatEventWhen(event, timeZone, locale), event.location].filter(Boolean).join(" · ")}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </SettingsSurface>
  );
}

/**
 * Event: a published Event record, drawn exactly as readers will see it. Only
 * the relationship is stored; the title, time, place and status come from the
 * Event when the story renders, so a change there reaches every story.
 */
export function EventEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("event", node);
  const issues = useReadiness("event", id, node.fields);
  const announce = useAnnounce();
  const { timeZone, locale } = useBylineEditorHost();
  const entry = useEventChoice(fields.event);
  const chooseRef = useRef<HTMLButtonElement>(null);
  useFocusWhenCreated(nodeKey, chooseRef);
  const readOnly = !node.editable;
  const event = entry.asset;
  const choose = (chosen: EventChoice) => {
    set({ event: chosen.id });
    announce(`${chosen.title} chosen.`);
  };
  return (
    <BlockShell
      type="event"
      node={node}
      issues={issues}
      actions={fields.event !== null ? <EventPicker title="Replace the event" onChoose={choose} trigger={<Button type="button" variant="ghost" size="sm"><Replace />Replace event</Button>} /> : null}
    >
      {fields.event === null ? (
        <Empty className="byline-media-empty" data-byline-chrome="" contentEditable={false}>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BlockIcon icon="event" /></EmptyMedia>
            <EmptyTitle>Choose an event</EmptyTitle>
            <EmptyDescription>Add a published school or community event.</EmptyDescription>
          </EmptyHeader>
          {readOnly ? null : <EventPicker title="Choose an event" onChoose={choose} trigger={<Button ref={chooseRef} type="button" size="sm">Choose an event</Button>} />}
        </Empty>
      ) : event ? (
        <EventView headingId={`${id}-heading`} event={event} timeZone={timeZone} locale={locale} />
      ) : (
        <div className="byline-media-status" data-status={entry.status} role={entry.status === "missing" ? "alert" : undefined}>
          {entry.status === "loading" ? <Spinner /> : null}
          <span>{entry.status === "loading" ? "Loading…" : "This event is not published, or is gone. Choose another."}</span>
        </div>
      )}
    </BlockShell>
  );
}
