"use client";

import { DisabledReason } from "@byline/newsroom-ui/components/disabled-reason";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Card } from "@byline/newsroom-ui/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, LayoutTemplate, Plus, Sheet } from "lucide-react";
import { useState } from "react";
import type { DataOverview, DatasetSummary, ProjectSummary } from "../../data/server";
import { useNewsroomRoutes } from "../shell/account";
import { dataKeys, fetchOverview } from "./api";
import { CreateDatasetDialog } from "./CreateDatasetDialog";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { useDataNavigation, type DataTab } from "./DataWorkspace";
import { DatasetStatus, formatAgo, formatWhen, ProjectStatus } from "./status";

/** The Data home: Projects (what readers see) and Datasets (the facts), each a working list. */
export function DataHome({ tab }: { tab: DataTab }) {
  const { api } = useNewsroomRoutes();
  const go = useDataNavigation();
  const overview = useQuery({ queryKey: dataKeys.overview(), queryFn: () => fetchOverview(api) });
  const [creating, setCreating] = useState<"dataset" | "project" | null>(null);
  const data = overview.data;
  const canManage = data?.capabilities.manageProjects ?? false;
  const editorOnly = "Only editors create datasets and projects. You can edit rows in any dataset.";

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 py-6 lg:px-6" data-byline-data-home="">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Datasets hold the facts the newsroom keeps. Projects are what readers see, built from published data.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DisabledReason reason={data && !canManage ? editorOnly : undefined}>
            <Button type="button" variant="outline" disabled={!canManage} onClick={() => setCreating("dataset")}><Sheet data-icon="inline-start" />New dataset</Button>
          </DisabledReason>
          <DisabledReason reason={data && !canManage ? editorOnly : undefined}>
            <Button type="button" disabled={!canManage} onClick={() => setCreating("project")}><Plus data-icon="inline-start" />New project</Button>
          </DisabledReason>
        </div>
      </header>

      {overview.isError ? (
        <InlineAlert title="Data isn't available" onAction={() => void overview.refetch()}>{(overview.error as Error).message}</InlineAlert>
      ) : (
        <Tabs value={tab} onValueChange={(next) => go({ tab: next as DataTab })}>
          <TabsList>
            <TabsTrigger value="projects">Projects{data ? <Badge variant="secondary" className="ml-1.5 tabular-nums">{data.projects.length}</Badge> : null}</TabsTrigger>
            <TabsTrigger value="datasets">Datasets{data ? <Badge variant="secondary" className="ml-1.5 tabular-nums">{data.datasets.length}</Badge> : null}</TabsTrigger>
          </TabsList>
          <TabsContent value="projects" className="mt-4">
            {!data ? <ListSkeleton /> : data.projects.length ? <ProjectList data={data} onOpen={(id) => go({ project: id })} /> : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><LayoutTemplate /></EmptyMedia>
                  <EmptyTitle>No projects yet</EmptyTitle>
                  <EmptyDescription>A project shows published data to readers: a table, a ranking, a timeline, or a page a developer built. {data.datasets.length ? "Start one from a dataset you have published." : "Start with a dataset."}</EmptyDescription>
                </EmptyHeader>
                {canManage ? <EmptyContent><Button type="button" onClick={() => setCreating(data.datasets.length ? "project" : "dataset")}>{data.datasets.length ? "New project" : "New dataset"}</Button></EmptyContent> : null}
              </Empty>
            )}
          </TabsContent>
          <TabsContent value="datasets" className="mt-4">
            {!data ? <ListSkeleton /> : data.datasets.length ? <DatasetList data={data} onOpen={(id) => go({ dataset: id })} /> : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Sheet /></EmptyMedia>
                  <EmptyTitle>No datasets yet</EmptyTitle>
                  <EmptyDescription>A dataset is a table of facts: results, a project's phases, a list of candidates. Paste it from a spreadsheet or build it field by field.</EmptyDescription>
                </EmptyHeader>
                {canManage ? <EmptyContent><Button type="button" onClick={() => setCreating("dataset")}>New dataset</Button></EmptyContent> : null}
              </Empty>
            )}
          </TabsContent>
        </Tabs>
      )}

      {data ? (
        <>
          <CreateDatasetDialog open={creating === "dataset"} onOpenChange={(open) => setCreating(open ? "dataset" : null)} onCreated={(id) => go({ dataset: id })} />
          <CreateProjectDialog open={creating === "project"} onOpenChange={(open) => setCreating(open ? "project" : null)} overview={data} onCreated={(id) => go({ project: id })} />
        </>
      ) : null}
    </main>
  );
}

function ListSkeleton() {
  return <div className="grid gap-2" aria-hidden="true">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12 w-full" />)}</div>;
}

/** A row that opens on click anywhere; its title button is the keyboard and screen-reader target. */
function openable(onOpen: () => void) {
  return {
    className: "cursor-pointer",
    onClick: (event: { target: EventTarget }) => {
      if ((event.target as HTMLElement).closest("a,button")) return;
      onOpen();
    }
  };
}

function ProjectList({ data, onOpen }: { data: DataOverview; onOpen: (id: number) => void }) {
  const titles = new Map(data.datasets.map((dataset) => [dataset.key, dataset.title]));
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Project</TableHead>
            <TableHead>Presentation</TableHead>
            <TableHead className="hidden md:table-cell">Data</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Edited</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.projects.map((project: ProjectSummary) => (
            <TableRow key={project.id} {...openable(() => onOpen(project.id))} data-data-project-row={project.slug}>
              <TableCell className="max-w-0 whitespace-normal">
                <Button type="button" variant="ghost" size="sm" className="h-auto min-h-0 justify-start rounded-none p-0 text-left font-medium whitespace-normal hover:bg-transparent hover:underline any-pointer-coarse:min-h-0" onClick={() => onOpen(project.id)}>{project.title}</Button>
                {project.deck ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{project.deck}</p> : null}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  {project.presentation.name}
                  <Badge variant="outline" className="font-normal">{project.presentation.kind === "template" ? "Template" : "Custom"}</Badge>
                  {!project.presentation.available ? <Badge variant="destructive">Missing</Badge> : null}
                </span>
              </TableCell>
              <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">{project.datasets.map((key) => titles.get(key) ?? key).join(", ") || "—"}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <ProjectStatus publication={project.publication} />
                  {project.publicUrl ? (
                    <a href={project.publicUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`Open ${project.title} on the public site`}><ExternalLink className="size-3.5" /></a>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">{formatAgo(project.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function DatasetList({ data, onOpen }: { data: DataOverview; onOpen: (id: number) => void }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[36%]">Dataset</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Fields</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Last published</TableHead>
            <TableHead className="hidden lg:table-cell">Used by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.datasets.map((dataset: DatasetSummary) => (
            <TableRow key={dataset.id} {...openable(() => onOpen(dataset.id))} data-data-dataset-row={dataset.key}>
              <TableCell className="max-w-0 whitespace-normal">
                <Button type="button" variant="ghost" size="sm" className="h-auto min-h-0 justify-start rounded-none p-0 text-left font-medium whitespace-normal hover:bg-transparent hover:underline any-pointer-coarse:min-h-0" onClick={() => onOpen(dataset.id)}>{dataset.title}</Button>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{dataset.key}</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">{dataset.records.toLocaleString("en-US")}</TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{dataset.fields}</TableCell>
              <TableCell><DatasetStatus publication={dataset.publication} /></TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{dataset.release ? formatWhen(dataset.release.releasedAt, data.timeZone) : "Never"}</TableCell>
              <TableCell className="hidden max-w-48 truncate text-muted-foreground lg:table-cell">{dataset.usedBy.map((project) => project.title).join(", ") || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
