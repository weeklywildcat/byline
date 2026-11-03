import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { StoryTitleButton } from "../story/story-parts";
import { StoryHoverCard } from "../story/StoryHoverCard";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Badge } from "../admin-ui/ui/badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../admin-ui/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../admin-ui/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../admin-ui/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../admin-ui/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../admin-ui/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "../admin-ui/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../admin-ui/ui/select";
import { Spinner } from "../admin-ui/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../admin-ui/ui/tabs";
import { describeEditorialError } from "../editorial/editorial-model";
import { contentHealthKey } from "../story/story-query";
import { contentHealthFixHref } from "./content-health-navigation";
import {
  groupHealthIssues,
  groupHealthStories,
  healthCategories,
  healthCheckId,
  healthSeverityLabels,
} from "./content-health-model";
import type { PlanningFetchers } from "./planning-api";
import type {
  ContentHealthIssue,
  ContentHealthResponse,
  ContentHealthSeverity,
} from "./planning-model";
import { NothingHere, PageHeader, ResourceGate } from "./PlanningPage";
import { useOptionalQuery } from "./planning-query";

type Filters = {
  search: string;
  severity: string;
  category: string;
  state: string;
  view: string;
};
const defaults: Filters = {
  search: "",
  severity: "all",
  category: "all",
  state: "all",
  view: "issues",
};
function readFilters(): Filters {
  if (typeof window === "undefined") return defaults;
  const params = new URLSearchParams(window.location.search);
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Filters)[])
    result[key] = params.get(`health-${key}`) || defaults[key];
  if (!["issues", "stories", "ignored"].includes(result.view))
    result.view = "issues";
  return result;
}
function Severity({ value }: { value: ContentHealthSeverity }) {
  return (
    <StatusBadge tone={value === "info" ? "neutral" : "attention"}>
      {healthSeverityLabels[value]}
    </StatusBadge>
  );
}
function CheckedAt({ value }: { value?: string | null }) {
  return value ? (
    <time dateTime={value}>{new Date(value).toLocaleString()}</time>
  ) : (
    <span>Not checked</span>
  );
}
function HealthFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    >
      <SelectTrigger
        aria-label={label}
        className="w-full sm:w-auto sm:min-w-36"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ContentHealth({
  fetchers,
  onOpenStory,
}: {
  fetchers: PlanningFetchers;
  onOpenStory: (storyId: number) => void;
}) {
  const client = useQueryClient();
  const [filters, setFilters] = useState(readFilters);
  const [disabling, setDisabling] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setFilters(readFilters());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function update(patch: Partial<Filters>) {
    setFilters((old) => {
      const next = { ...old, ...patch };
      const url = new URL(window.location.href);
      for (const key of Object.keys(defaults) as (keyof Filters)[]) {
        if (next[key] === defaults[key])
          url.searchParams.delete(`health-${key}`);
        else url.searchParams.set(`health-${key}`, next[key]);
      }
      window.history.replaceState(null, "", url);
      return next;
    });
  }
  const query = useOptionalQuery<ContentHealthResponse>(
    contentHealthKey,
    fetchers.getContentHealth ? () => fetchers.getContentHealth!() : undefined,
    "Content Health",
    (data) => Boolean(data?.scan?.running),
  );
  const refresh = () =>
    client.invalidateQueries({ queryKey: contentHealthKey });
  const failed = (error: unknown) =>
    toast.error(
      describeEditorialError(error, "The health check could not be updated."),
    );
  const scan = useMutation({
    mutationFn: () => fetchers.runContentHealthScan!(),
    onSuccess: async () => {
      await refresh();
      toast.success("Full scan scheduled");
    },
    onError: failed,
  });
  const recheck = useMutation({
    mutationFn: (storyId: number) => fetchers.recheckContentHealth!(storyId),
    onSuccess: async () => {
      await refresh();
      toast.success("Story rechecked");
    },
    onError: failed,
  });
  const disposition = useMutation({
    mutationFn: (
      input: Parameters<
        NonNullable<PlanningFetchers["setContentHealthDisposition"]>
      >[0],
    ) => fetchers.setContentHealthDisposition!(input),
    onSuccess: async (_data, input) => {
      await refresh();
      setDisabling(null);
      toast.success(
        input.restore
          ? "Check restored"
          : input.scope === "global"
          ? "Check disabled"
          : "Ignored for this story",
      );
    },
    onError: failed,
  });
  const hasFilters =
    filters.search !== "" ||
    filters.severity !== "all" ||
    filters.category !== "all" ||
    filters.state !== "all";
  const matches = (issue: ContentHealthIssue) => {
    const search = filters.search.trim().toLocaleLowerCase();
    const definition = query.data?.definitions?.[healthCheckId(issue)];
    return (
      (!search ||
        [issue.story?.title, issue.problem, issue.data?.url, definition?.title]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search)) &&
      (filters.severity === "all" || issue.severity === filters.severity) &&
      (filters.category === "all" || issue.category === filters.category) &&
      (filters.state === "all" || issue.state === filters.state)
    );
  };
  function row(issue: ContentHealthIssue, ignored = false) {
    return (
      <HealthOccurrence
        key={issue.id}
        issue={issue}
        ignored={ignored}
        onOpenStory={onOpenStory}
        busy={recheck.isPending || disposition.isPending}
        checking={recheck.isPending && recheck.variables === issue.story?.id}
        onRecheck={
          fetchers.recheckContentHealth && issue.story
            ? () => recheck.mutate(issue.story!.id)
            : undefined
        }
        onIgnore={
          fetchers.setContentHealthDisposition &&
          issue.story &&
          (issue.ignored?.scope !== "global" || query.data?.canManageChecks)
            ? () =>
                disposition.mutate({
                  storyId: issue.story!.id,
                  checkId: healthCheckId(issue),
                  restore: ignored,
                  scope: issue.ignored?.scope ?? "story",
                })
            : undefined
        }
        onDisable={
          query.data?.canManageChecks && fetchers.setContentHealthDisposition
            ? () => setDisabling(healthCheckId(issue))
            : undefined
        }
      />
    );
  }
  return (
    <>
      <PageHeader
        title="Content Health"
        description="Find and fix problems in published stories."
        actions={
          <Button
            disabled={
              !fetchers.runContentHealthScan ||
              query.data?.canScan === false ||
              scan.isPending
            }
            onClick={() => scan.mutate()}
          >
            {scan.isPending ? <Spinner data-icon="inline-start" /> : null}Run
            scan
          </Button>
        }
      />
      <ResourceGate query={query} label="Content Health">
        {(data) => {
          const active = data.issues.filter(matches);
          const ignored = (data.ignored ?? []).filter(matches);
          const groups = groupHealthIssues(active);
          const stories = groupHealthStories(active);
          const affected = new Set(
            data.issues.map((i) => i.story?.id).filter(Boolean),
          ).size;
          const scanState = data.scan;
          const disabled = Object.entries(data.disabledChecks ?? {});
          return (
            <div className="flex min-w-0 flex-col gap-3 pointer-coarse:[&_button]:min-h-11">
              <div
                role="status"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
              >
                {scanState?.running ? (
                  <span>
                    Scanning {scanState.checked ?? 0} of {scanState.total ?? 0}{" "}
                    stories…
                  </span>
                ) : data.lastRunAt ? (
                  <span>
                    Last full scan <CheckedAt value={data.lastRunAt} />
                  </span>
                ) : (
                  <span>No full scan completed yet</span>
                )}
                {data.stale ? <span>Results may be outdated</span> : null}
                {scanState?.failed ? (
                  <span>
                    {scanState.failed} stories could not be checked. Run scan to
                    retry.
                  </span>
                ) : null}
              </div>
              {query.error ? (
                <InlineAlert onAction={query.refetch}>
                  {query.error}
                </InlineAlert>
              ) : null}
              {data.scannerAvailable === false ? (
                <InlineAlert
                  title="Scanner unavailable"
                  onAction={query.refetch}
                >
                  Saved results may be outdated. Retry when the background
                  scanner is available.
                </InlineAlert>
              ) : null}
              <div
                aria-label="Content health summary"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 border-y py-2 text-sm"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ severity: "error", view: "issues" })}
                >
                  {data.issues.filter((i) => i.severity === "error").length}{" "}
                  critical
                </Button>
                <span aria-hidden="true">·</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update({ severity: "warning", view: "issues" })
                  }
                >
                  {data.issues.filter((i) => i.severity === "warning").length}{" "}
                  need attention
                </Button>
                <span aria-hidden="true">·</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ view: "stories" })}
                >
                  {affected} stories affected
                </Button>
                <span aria-hidden="true">·</span>
                <span>
                  {data.scanned ?? 0} checked
                  {data.eligible ? ` of ${data.eligible}` : ""}
                </span>
              </div>
              <Tabs
                value={filters.view}
                onValueChange={(view) => update({ view: String(view) })}
              >
                <TabsList variant="line">
                  <TabsTrigger value="issues">Issues</TabsTrigger>
                  <TabsTrigger value="stories">Stories</TabsTrigger>
                  <TabsTrigger value="ignored">Ignored</TabsTrigger>
                </TabsList>
                <div className="my-2 flex flex-wrap gap-2">
                  <InputGroup className="w-full sm:w-64">
                    <InputGroupInput
                      type="search"
                      aria-label="Search content health"
                      placeholder="Search stories or problems…"
                      value={filters.search}
                      onChange={(e) => update({ search: e.target.value })}
                    />
                    <InputGroupAddon>
                      <Search aria-hidden="true" />
                    </InputGroupAddon>
                  </InputGroup>
                  <HealthFilter
                    label="Severity"
                    value={filters.severity}
                    options={[
                      { value: "all", label: "All severities" },
                      ...Object.entries(healthSeverityLabels).map(
                        ([value, label]) => ({ value, label }),
                      ),
                    ]}
                    onChange={(severity) => update({ severity })}
                  />
                  <HealthFilter
                    label="Category"
                    value={filters.category}
                    options={[
                      { value: "all", label: "All categories" },
                      ...Object.entries(healthCategories).map(
                        ([value, label]) => ({ value, label }),
                      ),
                    ]}
                    onChange={(category) => update({ category })}
                  />
                  <HealthFilter
                    label="Finding state"
                    value={filters.state}
                    options={[
                      { value: "all", label: "All states" },
                      { value: "new", label: "New" },
                      { value: "existing", label: "Existing" },
                      { value: "regressed", label: "Regressed" },
                    ]}
                    onChange={(state) => update({ state })}
                  />
                </div>
                {hasFilters ? (
                  <div
                    className="mb-2 flex flex-wrap items-center gap-2"
                    aria-label="Active filters"
                  >
                    {Object.entries(filters)
                      .filter(
                        ([key, value]) =>
                          key !== "view" && value !== "all" && value !== "",
                      )
                      .map(([key, value]) => (
                        <Badge key={key} variant="secondary">
                          {key}:{" "}
                          {key === "severity"
                            ? healthSeverityLabels[
                                value as ContentHealthSeverity
                              ]
                            : healthCategories[value] || value}
                        </Badge>
                      ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update({ ...defaults, view: filters.view })
                      }
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : null}
                <TabsContent value="issues">
                  {groups.length ? (
                    <ItemGroup
                      aria-label="Content health issue types"
                      className="gap-0 overflow-hidden rounded-xl border"
                    >
                      {groups.map((group) => {
                        const definition = data.definitions?.[group.id];
                        const signals = [
                          ...new Set(
                            group.occurrences
                              .map((i) => i.state)
                              .filter(
                                (state) =>
                                  state === "new" || state === "regressed",
                              ),
                          ),
                        ];
                        return (
                          <Collapsible
                            key={group.id}
                            className="border-b last:border-b-0"
                          >
                            <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-2 px-3 py-3 text-left hover:bg-muted/40">
                              <ChevronDown
                                aria-hidden="true"
                                className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-180"
                              />
                              <Severity value={group.severity} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">
                                  {definition?.title || group.id}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {definition?.explanation ||
                                    group.occurrences[0].problem}
                                </span>
                              </span>
                              <span className="w-full pl-6 text-xs text-muted-foreground sm:w-auto sm:pl-0">
                                {group.occurrences.length} occurrences ·{" "}
                                {group.storyCount} stories ·{" "}
                                {
                                  healthCategories[
                                    definition?.category ||
                                      group.occurrences[0].category ||
                                      ""
                                  ]
                                }
                              </span>
                              {signals.map((state) => (
                                <Badge key={state} variant="outline">
                                  {state === "new" ? "New" : "Regressed"}
                                </Badge>
                              ))}
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                {definition?.why} {definition?.action}
                              </div>
                              <ItemGroup className="gap-0">
                                {group.occurrences.map((issue) => row(issue))}
                              </ItemGroup>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </ItemGroup>
                  ) : (
                    <HealthEmpty
                      filtered={hasFilters}
                      incomplete={data.stale}
                    />
                  )}
                </TabsContent>
                <TabsContent value="stories">
                  {stories.length ? (
                    <ItemGroup
                      aria-label="Stories with issues"
                      className="gap-0 overflow-hidden rounded-xl border"
                    >
                      {stories.map((story) => (
                        <Collapsible
                          key={story.id}
                          className="border-b last:border-b-0"
                        >
                          <Item size="sm" className="rounded-none">
                            <ItemContent>
                              <ItemTitle>
                                <StoryHoverCard
                                  storyId={story.id}
                                  title={story.story.title}
                                >
                                  <StoryTitleButton
                                    story={story.story}
                                    onOpen={onOpenStory}
                                  />
                                </StoryHoverCard>
                              </ItemTitle>
                              <ItemDescription className="line-clamp-none">
                                {story.occurrences.length} active issues ·{" "}
                                {story.categories
                                  .map(
                                    (category) =>
                                      healthCategories[category!] || category,
                                  )
                                  .join(", ")}{" "}
                                · Last checked{" "}
                                <CheckedAt
                                  value={story.occurrences[0].lastCheckedAt}
                                />
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Severity value={story.severity} />
                              <CollapsibleTrigger
                                render={<Button variant="ghost" size="sm" />}
                              >
                                Show issues
                                <ChevronDown aria-hidden="true" />
                              </CollapsibleTrigger>
                            </ItemActions>
                          </Item>
                          <CollapsibleContent>
                            <ItemGroup className="gap-0 border-t">
                              {story.occurrences.map((issue) => row(issue))}
                            </ItemGroup>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </ItemGroup>
                  ) : (
                    <HealthEmpty
                      filtered={hasFilters}
                      incomplete={data.stale}
                    />
                  )}
                </TabsContent>
                <TabsContent value="ignored">
                  {ignored.length ? (
                    <ItemGroup
                      aria-label="Ignored findings"
                      className="gap-0 overflow-hidden rounded-xl border"
                    >
                      {ignored.map((issue) => row(issue, true))}
                    </ItemGroup>
                  ) : (
                    <NothingHere
                      title="No ignored findings"
                      description="Intentional findings can be ignored for a story and restored here."
                    />
                  )}
                  {disabled.length && data.canManageChecks ? (
                    <div className="mt-4">
                      <h2 className="mb-2 text-sm font-medium">
                        Disabled checks
                      </h2>
                      <ItemGroup className="gap-0 rounded-xl border">
                        {disabled.map(([id, entry]) => (
                          <Item key={id} size="sm">
                            <ItemContent>
                              <ItemTitle>
                                {data.definitions?.[id]?.title || id}
                              </ItemTitle>
                              <ItemDescription>
                                Disabled by user #{entry.by} ·{" "}
                                <CheckedAt value={entry.at} />
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={disposition.isPending}
                                onClick={() =>
                                  disposition.mutate({
                                    checkId: id,
                                    scope: "global",
                                    restore: true,
                                  })
                                }
                              >
                                Enable check
                              </Button>
                            </ItemActions>
                          </Item>
                        ))}
                      </ItemGroup>
                    </div>
                  ) : null}
                </TabsContent>
              </Tabs>
              <Dialog
                open={Boolean(disabling)}
                onOpenChange={(open) => {
                  if (!open) setDisabling(null);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Disable this check?</DialogTitle>
                    <DialogDescription>
                      This removes{" "}
                      {data.definitions?.[disabling || ""]?.title ||
                        "this check"}{" "}
                      from active totals for every story. Managers can enable it
                      again in Ignored.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDisabling(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={disposition.isPending}
                      onClick={() => {
                        if (disabling)
                          disposition.mutate({
                            checkId: disabling,
                            scope: "global",
                          });
                      }}
                    >
                      Disable check
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          );
        }}
      </ResourceGate>
    </>
  );
}
function HealthEmpty({
  filtered,
  incomplete,
}: {
  filtered: boolean;
  incomplete?: boolean;
}) {
  return (
    <NothingHere
      title={
        filtered
          ? "No issues match"
          : incomplete
          ? "No issues in available results"
          : "No issues found"
      }
      description={
        filtered
          ? "Try changing or clearing your filters."
          : incomplete
          ? "Run a full scan to check all published stories. Results may be outdated."
          : "Content Health didn’t find anything that currently needs attention."
      }
    />
  );
}
function HealthOccurrence({
  issue,
  ignored,
  onOpenStory,
  busy,
  checking,
  onRecheck,
  onIgnore,
  onDisable,
}: {
  issue: ContentHealthIssue;
  ignored: boolean;
  onOpenStory: (id: number) => void;
  busy: boolean;
  checking: boolean;
  onRecheck?: () => void;
  onIgnore?: () => void;
  onDisable?: () => void;
}) {
  const fix = contentHealthFixHref(issue);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Item
            size="sm"
            className="rounded-none border-0 border-b px-3 py-3 last:border-b-0"
          />
        }
      >
        <ItemContent>
          <ItemTitle className="line-clamp-none">
            {issue.story ? (
              <StoryHoverCard
                storyId={issue.story.id}
                title={issue.story.title}
              >
                <StoryTitleButton story={issue.story} onOpen={onOpenStory} />
              </StoryHoverCard>
            ) : (
              "Story"
            )}
            {issue.state === "new" || issue.state === "regressed" ? (
              <Badge variant="outline">
                {issue.state === "new" ? "New" : "Regressed"}
              </Badge>
            ) : null}
          </ItemTitle>
          <ItemDescription className="line-clamp-none break-words [overflow-wrap:anywhere]">
            {issue.problem}
            {issue.data?.url ? (
              <span className="block font-mono text-xs">{issue.data.url}</span>
            ) : null}
            <span className="block text-xs">
              Last checked <CheckedAt value={issue.lastCheckedAt} />
              {ignored && issue.ignored ? (
                <>
                  {" "}
                  · {issue.ignored.scope === "global"
                    ? "Disabled"
                    : "Ignored"}{" "}
                  by user #{issue.ignored.by} ·{" "}
                  <CheckedAt value={issue.ignored.at} />
                  {issue.ignored.reason ? ` · ${issue.ignored.reason}` : ""}
                </>
              ) : null}
            </span>
          </ItemDescription>
        </ItemContent>
        <ItemActions className="flex-wrap">
          {fix && !ignored ? (
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={fix}
            >
              Fix
            </a>
          ) : null}
          {onRecheck ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onRecheck}
            >
              {checking ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Checking…
                </>
              ) : (
                "Recheck"
              )}
            </Button>
          ) : null}
          {ignored && onIgnore ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onIgnore}
            >
              Restore
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${
                    issue.story?.title || "finding"
                  }: ${healthCheckId(issue)}`}
                />
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {issue.story ? (
                <DropdownMenuItem onClick={() => onOpenStory(issue.story!.id)}>
                  Quick view story
                </DropdownMenuItem>
              ) : null}
              {onIgnore && !ignored ? (
                <DropdownMenuItem disabled={busy} onClick={onIgnore}>
                  Ignore for this story
                </DropdownMenuItem>
              ) : null}
              {onDisable && !ignored ? (
                <DropdownMenuItem disabled={busy} onClick={onDisable}>
                  Disable this check
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {issue.story ? (
          <ContextMenuItem onClick={() => onOpenStory(issue.story!.id)}>
            Quick view story
          </ContextMenuItem>
        ) : null}
        {onRecheck ? (
          <ContextMenuItem disabled={busy} onClick={onRecheck}>
            Recheck story
          </ContextMenuItem>
        ) : null}
        {onIgnore ? (
          <ContextMenuItem disabled={busy} onClick={onIgnore}>
            {ignored ? "Restore" : "Ignore for this story"}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
