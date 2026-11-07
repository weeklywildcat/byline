import type { ReactNode } from "react";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { ItemGroup, ItemContent, ItemTitle, ItemDescription, ItemActions } from "@byline/newsroom-ui/ui/item";
import { ItemButton } from "@byline/newsroom-ui/components/item-button";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import type { ContributorEntry } from "../editorial/editorial-model";
import { shortDateTime } from "../home/newsroom-model";
import { CollectionBrief } from "./CollectionBrief";
import { CollectionProperties } from "./CollectionProperties";
import { CollectionTasks } from "./CollectionTasks";
import { CollectionEmpty, InterviewRow } from "./collection-ui";
import { useCollectionHost } from "./collection-host";
import type { CollectionDetail, CollectionTab } from "./collection-model";
import type { CollectionActions } from "./collection-query";
import type { AddKind } from "./CollectionWorkspace";

export type UpcomingItem = { id: string; title: string; date: string; label: string; open: () => void };

/** Where the Collection's stories are, in workflow order (published last). */
const PROGRESS = ["Pitch", "Assigned", "Reporting", "Writing", "Editing", "Ready for Review", "On Hold", "Published"];

/**
 * The Collection's home: the reporting brief first, then what's next, how
 * the stories are progressing, and short previews of each section (never a
 * wall of analytics cards). On a wide enough workspace the Properties sit
 * beside it as a local aside; narrower, they follow the brief.
 */
export function CollectionOverview({
  detail,
  actions,
  people,
  timezone,
  upcoming,
  heading,
  onOpenInterview,
  onSection,
  onAdd,
}: {
  detail: CollectionDetail;
  actions: CollectionActions;
  people: ContributorEntry[];
  timezone: string;
  upcoming: UpcomingItem[];
  heading: (title: string, kind?: AddKind, count?: number) => ReactNode;
  onOpenInterview: (id: number) => void;
  onSection: (section: CollectionTab) => void;
  onAdd: (kind: AddKind) => void;
}) {
  const host = useCollectionHost();
  const c = detail.collection;
  const counts = new Map<string, number>();
  for (const story of detail.stories) {
    const label = story.publicationState.isPublished ? "Published" : story.workflow.label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const progress = [...counts.entries()].sort((a, b) => (PROGRESS.indexOf(a[0]) + 99) % 99 - (PROGRESS.indexOf(b[0]) + 99) % 99);
  const more = (section: CollectionTab, label: string) => (
    <Button variant="link" className="h-auto px-0" onClick={() => onSection(section)}>
      {label}
    </Button>
  );
  const presentation = c.publicPresentation;
  return (
    <div className="flex min-w-0 flex-col gap-7 @min-[960px]/collection:grid @min-[960px]/collection:grid-cols-[minmax(0,1fr)_18rem] @min-[960px]/collection:items-start @min-[960px]/collection:gap-8">
      <div className="contents @min-[960px]/collection:flex @min-[960px]/collection:min-w-0 @min-[960px]/collection:flex-col @min-[960px]/collection:gap-7">
        <div className="order-1 @min-[960px]/collection:order-none">
          <CollectionBrief collection={c} actions={actions} />
        </div>
        <section className="order-3 @min-[960px]/collection:order-none" aria-labelledby="collection-upcoming">
          <h2 id="collection-upcoming" className="mb-3 text-base font-semibold">Upcoming</h2>
          {upcoming.length ? (
            <ItemGroup className="gap-0">
              {upcoming.map((e) => (
                <ItemButton key={e.id} size="sm" onClick={e.open}>
                  <ItemContent>
                    <ItemTitle>{e.title}</ItemTitle>
                    <ItemDescription className="line-clamp-1">{e.label}</ItemDescription>
                  </ItemContent>
                  <ItemActions className="text-sm text-muted-foreground tabular-nums">{shortDateTime(e.date, timezone)}</ItemActions>
                </ItemButton>
              ))}
            </ItemGroup>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing dated yet. Schedule an interview, a story deadline or a task.</p>
          )}
          {host.calendarHref ? (
            <a
              href={host.calendarHref(c.id)}
              className={buttonVariants({ variant: "link", className: "h-auto px-0" })}
              onClick={(event) => {
                if (!host.openCalendar || event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                host.openCalendar(c.id);
              }}
            >
              View in Calendar
            </a>
          ) : null}
        </section>
        <section className="order-4 @min-[960px]/collection:order-none" aria-labelledby="collection-progress">
          <h2 id="collection-progress" className="mb-3 text-base font-semibold">
            Story progress <span className="ml-1 text-sm font-normal text-muted-foreground">{detail.stories.length} total</span>
          </h2>
          {progress.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Stories by stage">
              {progress.map(([label, count]) => (
                <li key={label}>
                  <Badge variant="outline" className="h-7 gap-1.5 px-2.5 text-sm font-normal">
                    <span className="font-semibold tabular-nums">{count}</span> {label.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <CollectionEmpty
              title="No stories yet"
              actions={c.canEdit ? <><Button size="sm" onClick={() => onAdd("story")}>New story</Button><Button size="sm" variant="outline" onClick={() => onAdd("existing")}>Add existing story</Button></> : undefined}
            >
              Add existing reporting or start a new story for this Collection.
            </CollectionEmpty>
          )}
          {detail.stories.length ? (
            <ItemGroup className="mt-3 gap-0">
              {detail.stories.slice(0, 4).map((story) => (
                <ItemButton key={story.id} size="sm" onClick={() => host.openStory(story.id)}>
                  <ItemContent>
                    <ItemTitle className="line-clamp-1">{story.title}</ItemTitle>
                    <ItemDescription>
                      {story.publicationState.isPublished ? "Published" : story.workflow.label}
                      {story.deadline && !story.publicationState.isPublished ? ` · due ${shortDateTime(story.deadline, timezone)}` : ""}
                    </ItemDescription>
                  </ItemContent>
                  {story.authors.length ? <ItemActions><PeopleAvatars people={story.authors} /></ItemActions> : null}
                </ItemButton>
              ))}
            </ItemGroup>
          ) : null}
          {detail.stories.length > 4 ? more("stories", `All ${detail.stories.length} stories`) : null}
        </section>
        <section className="order-5 @min-[960px]/collection:order-none">
          {heading("Reporting", "interview", detail.interviews.length)}
          {detail.interviews.length ? (
            <ItemGroup className="gap-0">
              {detail.interviews
                .filter((i) => i.status !== "cancelled")
                .slice(0, 4)
                .map((i) => (
                  <InterviewRow key={i.id} interview={i} timezone={timezone} onOpen={() => onOpenInterview(i.id)} />
                ))}
            </ItemGroup>
          ) : (
            <p className="text-sm text-muted-foreground">No shared interviews yet. Plan one so every linked story can use the reporting.</p>
          )}
          {detail.interviews.length > 4 ? more("reporting", "All reporting") : null}
        </section>
        <section className="order-6 @min-[960px]/collection:order-none">
          {heading("Open tasks", "task", detail.tasks.filter((t) => t.state === "open").length)}
          <CollectionTasks detail={detail} people={people} timezone={timezone} refresh={() => actions.refresh({ tasks: true, schedule: true })} preview />
          {detail.tasks.filter((t) => t.state === "open").length > 5 ? more("tasks", "All tasks") : null}
        </section>
        <section className="order-7 @min-[960px]/collection:order-none" aria-labelledby="collection-public-summary">
          <h2 id="collection-public-summary" className="mb-2 text-base font-semibold">Public presentation</h2>
          <p className="text-sm text-muted-foreground">
            {presentation?.publicEnabled
              ? `${presentation.publicFormat === "series" ? "Public series" : "Public coverage"} · /coverage/${presentation.publicSlug}/`
              : "Newsroom only."}
            {c.canPublish ? <> {more("public", presentation?.publicEnabled ? "Edit" : "Present publicly")}</> : null}
          </p>
        </section>
      </div>
      <CollectionProperties collection={c} actions={actions} people={people} timezone={timezone} />
    </div>
  );
}
