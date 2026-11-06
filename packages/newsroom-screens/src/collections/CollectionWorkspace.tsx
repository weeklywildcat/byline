import { useState, type ReactNode } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@byline/newsroom-ui/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@byline/newsroom-ui/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ItemGroup } from "@byline/newsroom-ui/ui/item";
import { PageHeader } from "../planning/PlanningPage";
import { StoryCreateDialog } from "../story/StoryCreateDialog";
import { TaskCreateDialog } from "../story/TaskCreateDialog";
import { ActivityRow, RowSkeletons } from "../story/rows";
import { describeEditorialError } from "../editorial/editorial-model";
import { siteDay } from "../home/newsroom-model";
import { CollectionAddDialog } from "./CollectionAddDialog";
import { CollectionOverview, type UpcomingItem } from "./CollectionOverview";
import { CollectionPublicPresentation } from "./CollectionPublicPresentation";
import { CollectionReporting } from "./CollectionReporting";
import { CollectionResources } from "./CollectionResources";
import { CollectionStories } from "./CollectionStories";
import { CollectionTasks } from "./CollectionTasks";
import { InterviewPeek } from "./InterviewPeek";
import { ActionMenu, Choice, CollectionEmpty, collectionDates } from "./collection-ui";
import { useCollectionHost } from "./collection-host";
import { useCollectionGuard } from "./collection-guard";
import { useCollectionActions, useCollectionDetail } from "./collection-query";
import {
  availableCollectionTabs,
  collectionActions,
  collectionStatuses,
  collectionTabs,
  collectionTypes,
  type Collection,
  type CollectionAction,
  type CollectionDetail,
  type CollectionRoute,
  type CollectionTab,
} from "./collection-model";
import type { ContributorEntry } from "../editorial/editorial-model";

export type AddKind = "story" | "existing" | "interview" | "task" | "resource";

const ADD_LABELS: Record<AddKind, string> = {
  story: "New story",
  existing: "Existing story",
  interview: "Interview",
  task: "Task",
  resource: "Resource",
};

/**
 * One open Collection: a focused project workspace (never a modal). Its
 * section and open interview are the host's address (`route`): moving
 * between them is navigation, so Back, Forward and refresh keep the reader's
 * place, and every move first passes the workspace's unsaved-changes guard.
 */
export function CollectionWorkspace({
  route,
  onNavigate,
  onBack,
  onAction,
  people,
  timezone,
  switcher,
  initialAdd,
}: {
  route: CollectionRoute & { collectionId: number };
  onNavigate: (route: CollectionRoute, options?: { replace?: boolean }) => void;
  onBack: () => void;
  onAction: (action: CollectionAction, collection: Collection) => void;
  /** Everyone who can be given work (from the list or the detail). */
  people: ContributorEntry[];
  timezone: string;
  /** A host's "Switch collection" control, for screens without the switcher pane. */
  switcher?: ReactNode;
  /** Opens an add dialog on arrival (a row's Add story / Add interview). */
  initialAdd?: AddKind;
}) {
  const host = useCollectionHost();
  const id = route.collectionId;
  const detail = useCollectionDetail(host.api, id);
  const actions = useCollectionActions(host.api, id);
  const { guard } = useCollectionGuard();
  const [add, setAdd] = useState<AddKind | null>(initialAdd ?? null);
  if (detail.isPending) return <RowSkeletons count={8} />;
  if (detail.isError || !detail.data)
    return (
      <div className="flex flex-col gap-3">
        {switcher}
        <InlineAlert onAction={() => void detail.refetch()}>
          {describeEditorialError(detail.error, "The Collection could not be loaded.")}
        </InlineAlert>
      </div>
    );
  const data = detail.data;
  const c = data.collection;
  const tabs = availableCollectionTabs(c, { activity: host.activity });
  const tab: CollectionTab = tabs.includes(route.tab) ? route.tab : "overview";
  const go = (next: Partial<CollectionRoute>, options?: { replace?: boolean }) =>
    guard(() => onNavigate({ ...route, interviewId: null, ...next }, options));
  const openInterview = (interviewId: number) => go({ tab: "reporting", interviewId });
  const interview = route.interviewId ? data.interviews.find((i) => i.id === route.interviewId) : undefined;
  const upcoming = upcomingWork(data, timezone, {
    interview: openInterview,
    tasks: () => go({ tab: "tasks" }),
    story: host.openStory,
    appointment: (storyId, appointmentId) => host.openStoryWorkspace(storyId, { appointmentId }),
  });
  const heading = (title: string, kind?: AddKind, count?: number) => (
    <header className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">
        {title}
        {count !== undefined ? <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span> : null}
      </h2>
      {kind && c.canEdit ? (
        <Button variant="outline" size="sm" onClick={() => setAdd(kind)}>
          <Plus data-icon="inline-start" />
          {kind === "existing" ? "Add story" : `Add ${kind}`}
        </Button>
      ) : null}
    </header>
  );
  const menu = collectionActions(c)
    .filter((a) => a.id !== "open")
    .map((a) => ({
      ...a,
      run: () =>
        a.id === "story" ? setAdd("existing") : a.id === "interview" ? setAdd("interview") : onAction(a.id, c),
    }));
  const calendar = host.calendarHref ? host.calendarHref(c.id) : null;
  return (
    <div className="@container/collection flex min-w-0 flex-col gap-5" data-collection-id={c.id}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<button type="button" onClick={() => guard(onBack)} />}>Collections</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-[40ch] truncate">{c.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {switcher}
      </div>
      <PageHeader
        title={c.name}
        description={[collectionTypes[c.type], collectionDates(c, timezone), c.archived ? "Archived" : ""].filter(Boolean).join(" · ")}
        actions={
          <>
            <Choice
              label="Collection status"
              value={c.status}
              options={
                c.canArchive ?? c.canEdit
                  ? collectionStatuses
                  : Object.fromEntries(Object.entries(collectionStatuses).filter(([key]) => key !== "archived" || c.status === "archived"))
              }
              appearance="value"
              disabled={!c.canEdit || actions.update.isPending || (c.archived && !(c.canArchive ?? c.canEdit))}
              onChange={(status) => actions.update.mutate({ status: status as Collection["status"] })}
            />
            {c.members.length || c.lead ? <PeopleAvatars people={[...(c.lead ? [c.lead] : []), ...c.members]} /> : null}
            {calendar ? (
              <Button
                variant="outline"
                className="pointer-coarse:min-h-11"
                render={
                  <a
                    href={calendar}
                    onClick={(event) => {
                      if (!host.openCalendar || event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      guard(() => host.openCalendar!(c.id));
                    }}
                  />
                }
              >
                <CalendarDays data-icon="inline-start" aria-hidden="true" />
                <span className="hidden @min-[640px]/collection:inline">View in Calendar</span>
                <span className="sr-only @min-[640px]/collection:hidden">View in Calendar</span>
              </Button>
            ) : null}
            {c.canEdit ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button className="pointer-coarse:min-h-11" />}>
                  <Plus data-icon="inline-start" />
                  Add
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(ADD_LABELS) as AddKind[]).map((kind) => (
                    <DropdownMenuItem key={kind} className="pointer-coarse:min-h-11" onClick={() => setAdd(kind)}>
                      {ADD_LABELS[kind]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {menu.length ? <ActionMenu actions={menu} /> : null}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(next) => go({ tab: next as CollectionTab })} className="min-w-0 gap-5">
        <TabsList variant="line" aria-label="Collection workspace" className="max-w-full justify-start overflow-x-auto">
          {tabs.map((name) => (
            <TabsTrigger key={name} value={name} className="min-h-10 px-3 pointer-coarse:min-h-11">
              {collectionTabs[name]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <CollectionOverview
            detail={data}
            actions={actions}
            people={people}
            timezone={timezone}
            upcoming={upcoming}
            heading={heading}
            onOpenInterview={openInterview}
            onSection={(section) => go({ tab: section })}
            onAdd={setAdd}
          />
        </TabsContent>
        <TabsContent value="stories">
          {heading("Stories", undefined, data.stories.length)}
          {c.canEdit ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button onClick={() => setAdd("story")}>
                <Plus data-icon="inline-start" />
                New story
              </Button>
              <Button variant="outline" onClick={() => setAdd("existing")}>
                Add existing story
              </Button>
            </div>
          ) : null}
          <CollectionStories detail={data} timezone={timezone} onRemove={(storyId) => actions.membership.mutate({ storyId, linked: false })} />
        </TabsContent>
        <TabsContent value="reporting">
          <CollectionReporting detail={data} timezone={timezone} heading={heading} onOpenInterview={openInterview} />
        </TabsContent>
        <TabsContent value="tasks">
          {heading("Collection tasks", "task")}
          <CollectionTasks detail={data} people={people} timezone={timezone} refresh={() => actions.refresh({ tasks: true, schedule: true })} />
          {data.storyTasks?.length ? (
            <section className="mt-8" aria-labelledby="collection-story-tasks">
              <h2 id="collection-story-tasks" className="mb-1 text-base font-semibold">Story tasks</h2>
              <p className="mb-3 text-sm text-muted-foreground">Open work on this Collection’s stories, labelled with its story. It is managed in each story.</p>
              <CollectionTasks detail={{ ...data, tasks: data.storyTasks }} people={people} timezone={timezone} refresh={() => actions.refresh({ tasks: true, schedule: true })} storyLabels />
            </section>
          ) : null}
        </TabsContent>
        <TabsContent value="resources">
          {heading("Resources", "resource", data.resources.length)}
          <CollectionResources detail={data} refresh={() => actions.refresh()} />
        </TabsContent>
        {tabs.includes("public") ? (
          <TabsContent value="public">
            <CollectionPublicPresentation detail={data} actions={actions} />
          </TabsContent>
        ) : null}
        {tabs.includes("activity") ? (
          <TabsContent value="activity">
            {heading("Activity")}
            <ItemGroup className="gap-0">
              {(data.activity ?? []).map((item) => (
                <ActivityRow key={item.id} item={item} timezone={timezone} now={new Date()} />
              ))}
            </ItemGroup>
            {!data.activity?.length ? (
              <CollectionEmpty title="No activity yet">Meaningful reporting changes will appear here.</CollectionEmpty>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
      {add === "existing" || add === "interview" || add === "resource" ? (
        <CollectionAddDialog
          key={add}
          kind={add}
          detail={data}
          onClose={() => setAdd(null)}
          onSaved={async (interviewId) => {
            await actions.refresh({ membership: add === "existing", schedule: add === "interview" });
            setAdd(null);
            if (interviewId) openInterview(interviewId);
          }}
        />
      ) : null}
      <StoryCreateDialog
        open={add === "story"}
        fetchers={{ ...host.fetchers, createStory: (title, preset) => host.api.createStory(id, title, preset) }}
        onClose={() => setAdd(null)}
        onCreated={(story) => {
          void actions.refresh({ membership: true });
          host.onStoryCreated(story);
        }}
      />
      <TaskCreateDialog
        collectionId={id}
        onCreated={() => void actions.refresh({ tasks: true, schedule: true })}
        open={add === "task"}
        onClose={() => setAdd(null)}
        fetchers={host.fetchers}
        stories={data.stories}
        people={people}
        currentUser={host.currentUserId ? { id: host.currentUserId, name: people.find((p) => Number(p.id) === host.currentUserId)?.name || "" } : null}
        canAssign={Boolean(c.canEdit)}
        timezone={timezone}
      />
      {interview ? (
        <InterviewPeek
          key={interview.id}
          interview={interview}
          detail={data}
          people={people}
          timezone={timezone}
          onClose={() => go({ tab: "reporting", interviewId: null })}
          onSaved={() => onNavigate({ ...route, tab: "reporting", interviewId: null })}
          refresh={() => actions.refresh({ schedule: true, tasks: true })}
        />
      ) : null}
      {route.interviewId && !interview ? (
        <InlineAlert onAction={() => onNavigate({ ...route, interviewId: null }, { replace: true })} actionLabel="Back to Reporting">
          That interview is no longer in this Collection.
        </InlineAlert>
      ) : null}
    </div>
  );
}

/** The Collection's next dated commitments, from its own records and its stories' (soonest first). */
export function upcomingWork(
  data: CollectionDetail,
  timezone: string,
  open: {
    interview: (id: number) => void;
    tasks: () => void;
    story: (id: number) => void;
    appointment: (storyId: number, appointmentId: string) => void;
  },
  now = new Date(),
  limit = 6,
): UpcomingItem[] {
  const today = siteDay(now, timezone);
  return [
    ...data.interviews
      .filter((i) => i.scheduledAt && !["completed", "cancelled"].includes(i.status))
      .map((i) => ({ id: `i${i.id}`, title: i.interviewee, date: i.scheduledAt, label: "Collection interview", open: () => open.interview(i.id) })),
    ...(data.appointments || [])
      .filter((a) => a.startAt && !["completed", "cancelled"].includes(a.status))
      .map((a) => ({ id: `a${a.id}`, title: a.title, date: a.startAt!, label: `Story appointment · ${a.storyTitle}`, open: () => open.appointment(a.storyId, a.id) })),
    ...data.stories
      .filter((s) => s.deadline && !s.publicationState.isPublished)
      .map((s) => ({ id: `s${s.id}`, title: s.title, date: s.deadline!, label: "Story deadline", open: () => open.story(s.id) })),
    ...data.tasks
      .filter((t) => t.state === "open" && t.dueAt)
      .map((t) => ({ id: `t${t.id}`, title: t.title, date: t.dueAt!, label: "Collection task due", open: open.tasks })),
  ]
    .filter((e) => siteDay(e.date, timezone) >= today)
    .sort((a, b) => siteDay(a.date, timezone).localeCompare(siteDay(b.date, timezone)) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, limit);
}
