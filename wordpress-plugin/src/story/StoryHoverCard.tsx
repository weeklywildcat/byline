import { createContext, useContext, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ListTodo } from "lucide-react";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { decodeEntities } from "../admin-ui/lib/text";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../admin-ui/ui/hover-card";
import { Separator } from "../admin-ui/ui/separator";
import { Skeleton } from "../admin-ui/ui/skeleton";
import { exactDate, shortDateTime } from "../home/newsroom-model";
import { reportingSummaryLine, type PlanningStory } from "../planning/planning-model";
import { ProductionSummary, WorkflowBadge, plannedLabel } from "./story-parts";
import type { StoryFetchers } from "./story-fetchers";
import { workspaceKey } from "./story-query";
import { openTasks } from "../workspace/workspace-model";

type StoryHoverSummary = Pick<PlanningStory, "id" | "title"> & Partial<Omit<PlanningStory, "id" | "title">>;

type StoryHoverContextValue = { fetchers: StoryFetchers };

const StoryHoverContext = createContext<StoryHoverContextValue | null>(null);

export function StoryHoverProvider({ fetchers, children }: StoryHoverContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ fetchers }), [fetchers]);
  return <StoryHoverContext value={value}>{children}</StoryHoverContext>;
}

function StoryHoverBody({ summary, loading, failed, timezone, note }: {
  summary: StoryHoverSummary;
  loading: boolean;
  failed: boolean;
  timezone: string;
  note?: string;
}) {
  const title = decodeEntities(summary.title) || "Untitled story";
  const writers = summary.authors?.length ? summary.authors : summary.writer ? [summary.writer] : [];
  const deadline = summary.deadline ? exactDate(summary.deadline, timezone) : "";
  const planned = summary.plannedPublication ? plannedLabel(summary.plannedPublication, timezone) : "";
  const reportingLine = summary.reporting ? reportingSummaryLine(summary.reporting) : "";

  return <div data-slot="story-hover-preview" aria-label={`Story preview: ${title}`} className="flex flex-col gap-3">
    {summary.featuredImage?.url ? <img src={summary.featuredImage.url} alt="" className="aspect-[16/7] w-full rounded-md object-cover" /> : null}
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="line-clamp-3 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{title}</p>
        {summary.wordpressState?.isPublished ? <p className="mt-0.5 text-xs text-muted-foreground">Published{summary.wordpressState.publishedAt ? ` · ${shortDateTime(summary.wordpressState.publishedAt, timezone)}` : ""}</p> : null}
      </div>
      {summary.workflow ? <WorkflowBadge workflow={summary.workflow} className="max-w-32 shrink-0" /> : loading ? <Skeleton className="h-5 w-20 shrink-0" /> : null}
    </div>

    {writers.length ? <div className="flex min-w-0 items-center gap-2">
      <PeopleAvatars people={writers} max={3} />
      <span className="truncate text-xs text-muted-foreground">{writers.map((person) => person.name).join(", ")}</span>
    </div> : loading ? <Skeleton className="h-4 w-36" /> : <span className="text-xs text-muted-foreground">Unassigned</span>}

    {loading && !summary.workflow ? <div className="flex flex-col gap-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-4/5" /></div> : null}

    {deadline || planned ? <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {deadline ? <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden="true" />Due {deadline}</span> : null}
      {planned ? <span>Planned {planned}</span> : null}
    </div> : null}

    {reportingLine ? <div className="flex items-start gap-1.5 text-xs text-muted-foreground"><ListTodo className="mt-0.5 size-3 shrink-0" aria-hidden="true" /><span>{reportingLine}</span></div> : null}
    {summary.visual ? <ProductionSummary story={summary as PlanningStory} className="flex-row gap-2 text-xs" empty={null} /> : null}

    {failed ? <p className="text-xs text-muted-foreground">The full preview is unavailable. Open the story for details.</p> : null}
    {note ? <><Separator /><p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{note}</p></> : null}
  </div>;
}

export function StoryHoverCard(props: {
  storyId: number;
  title: string;
  story?: StoryHoverSummary;
  note?: string;
  children: ReactElement;
}) {
  const context = useContext(StoryHoverContext);
  if (!context?.fetchers.getWorkspace || props.storyId <= 0) return props.children;
  return <StoryHoverCardQuery {...props} context={context} />;
}

function StoryHoverCardQuery({ storyId, title, story, note, children, context }: {
  storyId: number;
  title: string;
  story?: StoryHoverSummary;
  note?: string;
  children: ReactElement;
  context: StoryHoverContextValue;
}) {
  const [open, setOpen] = useState(false);
  const blockOpenUntil = useRef(0);
  const suppressForSecondaryPress = () => {
    blockOpenUntil.current = performance.now() + 750;
    setOpen(false);
  };
  const preview = useQuery({
    queryKey: workspaceKey(storyId),
    queryFn: () => context.fetchers.getWorkspace!(storyId),
    enabled: open,
    staleTime: 30_000
  });

  const workspace = preview.data;
  const resolved: StoryHoverSummary = workspace?.story || story || { id: storyId, title };
  const enriched: StoryHoverSummary = workspace
    ? { ...resolved, openTaskCount: openTasks(workspace.tasks).length, reporting: workspace.reporting || resolved.reporting, mediaSummary: workspace.story.mediaSummary || resolved.mediaSummary }
    : resolved;
  const timezone = workspace?.timezone || "UTC";
  return <HoverCard open={open} onOpenChange={(next) => {
    if (next && performance.now() < blockOpenUntil.current) return;
    setOpen(next);
  }}>
    <HoverCardTrigger
      delay={260}
      closeDelay={140}
      render={children}
      onPointerDownCapture={(event) => {
        if (event.button === 2 || (event.button === 0 && event.ctrlKey)) suppressForSecondaryPress();
      }}
      onContextMenuCapture={suppressForSecondaryPress}
    />
    <HoverCardContent className="pointer-events-none w-[22rem] max-w-[calc(100vw-1rem)]">
      <StoryHoverBody summary={enriched} loading={preview.isPending && !workspace} failed={preview.isError} timezone={timezone} note={note} />
    </HoverCardContent>
  </HoverCard>;
}
