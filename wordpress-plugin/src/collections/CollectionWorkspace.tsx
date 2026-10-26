import { CollectionOverview } from "./CollectionOverview";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../admin-ui/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../admin-ui/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../admin-ui/ui/tabs";
import { ItemGroup } from "../admin-ui/ui/item";
import { PageHeader } from "../planning/PlanningPage";
import type { PlanningAppFetchers } from "../planning/PlanningApp";
import { StoryCreateDialog } from "../story/StoryCreateDialog";
import { TaskCreateDialog } from "../story/TaskCreateDialog";
import { ActivityRow, RowSkeletons } from "../story/rows";
import type { ContributorEntry } from "../editorial/editorial-model";
import { exactDate, siteDay } from "../home/newsroom-model";
import { CollectionAddDialog } from "./CollectionAddDialog";
import { CollectionResources } from "./CollectionResources";
import { CollectionStories } from "./CollectionStories";
import { CollectionTasks } from "./CollectionTasks";
import { InterviewPeek } from "./InterviewPeek";
import {
  ActionMenu,
  Choice,
  CollectionEmpty,
  InterviewRow,
} from "./collection-ui";
import {
  collectionActions,
  collectionStatuses,
  collectionTypes,
  type Collection,
  type CollectionAction,
} from "./collection-model";
import { collectionKey, type CollectionApi } from "./collection-api";
import { useCollectionActions } from "./collection-query";
export type AddKind = "story" | "existing" | "interview" | "task" | "resource";
export function CollectionWorkspace({
  id,
  api,
  fetchers,
  people,
  timezone,
  currentUserId,
  workspaceUrl,
  onStory,
  onBack,
  onAction,
  initialAdd,
}: {
  id: number;
  api: CollectionApi;
  fetchers: PlanningAppFetchers;
  people: ContributorEntry[];
  timezone: string;
  currentUserId: number;
  workspaceUrl: (id: number) => string;
  onStory: (id: number) => void;
  onBack: () => void;
  onAction: (a: CollectionAction, c: Collection) => void;
  initialAdd?: AddKind;
}) {
  const detail = useQuery({
    queryKey: collectionKey(id),
    queryFn: () => api.detail(id),
  });
  const actions = useCollectionActions(api, id);
  const [tab, setTab] = useState(
    new URLSearchParams(window.location.search).has("interview")
      ? "interviews"
      : "overview",
  );
  const [add, setAdd] = useState<AddKind | null>(initialAdd || null);
  const [interviewId, setInterview] = useState<number | null>(
    Number(new URLSearchParams(window.location.search).get("interview")) ||
      null,
  );
  if (detail.isPending) return <RowSkeletons count={8} />;
  if (detail.isError || !detail.data)
    return (
      <InlineAlert onAction={() => void detail.refetch()}>
        The Collection could not be loaded.
      </InlineAlert>
    );
  const data = detail.data;
  const c = data.collection;
  const now = new Date();
  const heading = (title: string, kind?: AddKind) => (
    <header className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {kind && c.canEdit ? (
        <Button variant="outline" size="sm" onClick={() => setAdd(kind)}>
          <Plus data-icon="inline-start" />
          Add {kind === "existing" ? "story" : kind}
        </Button>
      ) : null}
    </header>
  );
  const stories = () =>
    data.stories.length ? (
      <CollectionStories
        detail={data}
        fetchers={fetchers}
        timezone={timezone}
        workspaceUrl={workspaceUrl}
        onOpenStory={onStory}
        onRemove={(target) =>
          actions.link.mutate({ kind: "story", target, linked: false })
        }
      />
    ) : (
      <CollectionEmpty
        title="No stories yet"
        actions={
          c.canEdit ? (
            <>
              <Button onClick={() => setAdd("story")}>New story</Button>
              <Button variant="outline" onClick={() => setAdd("existing")}>
                Add existing story
              </Button>
            </>
          ) : undefined
        }
      >
        Add existing reporting or start a new story for this collection.
      </CollectionEmpty>
    );
  const interviews = (preview = false) =>
    data.interviews.length ? (
      <ItemGroup className="gap-0">
        {data.interviews.slice(0, preview ? 4 : undefined).map((i) => (
          <InterviewRow
            key={i.id}
            interview={i}
            timezone={timezone}
            onOpen={() => setInterview(i.id)}
          />
        ))}
      </ItemGroup>
    ) : (
      <CollectionEmpty title="No interviews yet">
        Plan a shared interview so every linked story can use the reporting.
      </CollectionEmpty>
    );
  const upcoming = [
    ...data.interviews
      .filter(
        (i) => i.scheduledAt && !["completed", "cancelled"].includes(i.status),
      )
      .map((i) => ({
        id: `i${i.id}`,
        title: i.interviewee,
        date: i.scheduledAt,
        label: "Interview",
        open: () => setInterview(i.id),
      })),
    ...data.tasks
      .filter((t) => t.state === "open" && t.dueAt)
      .map((t) => ({
        id: `t${t.id}`,
        title: t.title,
        date: siteDay(t.dueAt!, timezone),
        label: "Task due",
        open: () => setTab("tasks"),
      })),
    ...data.stories
      .filter((s) => s.deadline && !s.wordpressState.isPublished)
      .map((s) => ({
        id: `s${s.id}`,
        title: s.title,
        date: s.deadline!,
        label: "Story deadline",
        open: () => onStory(s.id),
      })),
    ...(data.appointments || [])
      .filter(
        (a) => a.startAt && !["completed", "cancelled"].includes(a.status),
      )
      .map((a) => ({
        id: `a${a.id}`,
        title: a.title,
        date: a.startAt!,
        label: "Appointment",
        open: () =>
          window.location.assign(
            `${workspaceUrl(a.storyId)}&appointment=${a.id}`,
          ),
      })),
  ]
    .filter((e) => siteDay(e.date, timezone) >= siteDay(now, timezone))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<button type="button" onClick={onBack} />}>
              Collections
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{c.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <PageHeader
        title={c.name}
        description={`${collectionTypes[c.type]}${
          c.startDate
            ? ` · ${exactDate(c.startDate, timezone)}${
                c.endDate ? ` – ${exactDate(c.endDate, timezone)}` : ""
              }`
            : ""
        }`}
        actions={
          <>
            <Choice
              label="Collection status"
              value={c.status}
              options={collectionStatuses}
              appearance="value"
              disabled={!c.canEdit || actions.update.isPending}
              onChange={(status) =>
                actions.update.mutate({
                  status: status as Collection["status"],
                })
              }
            />
            <PeopleAvatars people={c.members} />
            {c.canEdit ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button className="pointer-coarse:min-h-11" />}
                >
                  <Plus data-icon="inline-start" />
                  Add
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(
                    [
                      "story",
                      "existing",
                      "interview",
                      "task",
                      "resource",
                    ] as AddKind[]
                  ).map((kind) => (
                    <DropdownMenuItem
                      key={kind}
                      className="pointer-coarse:min-h-11"
                      onClick={() => setAdd(kind)}
                    >
                      {
                        {
                          story: "New story",
                          existing: "Existing story",
                          interview: "Interview",
                          task: "Task",
                          resource: "Resource",
                        }[kind]
                      }
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <ActionMenu
              actions={collectionActions(c)
                .filter((a) => a.id !== "open")
                .map((a) => ({
                  ...a,
                  run: () =>
                    a.id === "story"
                      ? setAdd("existing")
                      : a.id === "interview"
                      ? setAdd("interview")
                      : onAction(a.id, c),
                }))}
            />
          </>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(String(v))}
        className="min-w-0 gap-5"
      >
        <TabsList
          variant="line"
          aria-label="Collection workspace"
          className="max-w-full justify-start overflow-x-auto"
        >
          {[
            "overview",
            "stories",
            "interviews",
            "tasks",
            "resources",
            "activity",
          ].map((name) => (
            <TabsTrigger
              key={name}
              value={name}
              className="min-h-10 px-3 pointer-coarse:min-h-11"
            >
              {name[0].toUpperCase() + name.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <CollectionOverview
            detail={data}
            actions={actions}
            fetchers={fetchers}
            people={people}
            timezone={timezone}
            upcoming={upcoming}
            heading={heading}
            stories={stories()}
            interviews={interviews(true)}
          />
        </TabsContent>
        <TabsContent value="stories">
          {heading("Stories", "existing")}
          {c.canEdit ? (
            <Button
              variant="outline"
              className="mb-3"
              onClick={() => setAdd("story")}
            >
              New story
            </Button>
          ) : null}
          {stories()}
        </TabsContent>
        <TabsContent value="interviews">
          {heading("Interviews", "interview")}
          {interviews()}
        </TabsContent>
        <TabsContent value="tasks">
          {heading("Tasks", "task")}
          <CollectionTasks
            detail={data}
            fetchers={fetchers}
            people={people}
            timezone={timezone}
            refresh={actions.refresh}
          />
        </TabsContent>
        <TabsContent value="resources">
          {heading("Resources", "resource")}
          <CollectionResources
            detail={data}
            api={api}
            refresh={actions.refresh}
            onRemove={(target) =>
              actions.link.mutate({ kind: "resource", target, linked: false })
            }
          />
        </TabsContent>
        <TabsContent value="activity">
          {heading("Activity")}
          <ItemGroup className="gap-0">
            {data.activity.map((item) => (
              <ActivityRow
                key={item.id}
                item={item}
                timezone={timezone}
                now={now}
              />
            ))}
          </ItemGroup>
          {!data.activity.length ? (
            <CollectionEmpty title="No activity yet">
              Meaningful reporting changes will appear here.
            </CollectionEmpty>
          ) : null}
        </TabsContent>
      </Tabs>
      {add === "existing" || add === "interview" || add === "resource" ? (
        <CollectionAddDialog
          key={add}
          kind={add}
          api={api}
          detail={data}
          onClose={() => setAdd(null)}
          onSaved={async (interview) => {
            await actions.refresh();
            setAdd(null);
            if (interview) setInterview(interview);
          }}
        />
      ) : null}
      <StoryCreateDialog
        open={add === "story"}
        fetchers={{
          ...fetchers,
          createStory: (title, preset) => api.createStory(id, title, preset),
        }}
        onClose={() => setAdd(null)}
        onCreated={(story) =>
          window.location.assign(
            story.workspaceUrl || workspaceUrl(story.story.id),
          )
        }
      />
      <TaskCreateDialog
        collectionId={id}
        onCreated={() => void actions.refresh()}
        open={add === "task"}
        onClose={() => setAdd(null)}
        fetchers={fetchers}
        stories={data.stories}
        people={people}
        currentUser={{
          id: currentUserId,
          name: people.find((p) => Number(p.id) === currentUserId)?.name || "",
        }}
        canAssign={Boolean(c.canDuplicate)}
        timezone={timezone}
      />
      {interviewId && data.interviews.find((i) => i.id === interviewId) ? (
        <InterviewPeek
          key={interviewId}
          interview={data.interviews.find((i) => i.id === interviewId)!}
          detail={data}
          api={api}
          people={people}
          timezone={timezone}
          onClose={() => setInterview(null)}
          refresh={actions.refresh}
        />
      ) : null}
    </div>
  );
}
