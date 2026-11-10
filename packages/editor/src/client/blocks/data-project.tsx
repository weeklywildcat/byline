"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, type BlockIssue } from "@byline/article-body";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { DataProjectFigure } from "@byline/ui/article-body";
import { ExternalLink, Replace } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { dataProjectSelection, groupDataProjects, type DataProjectChoice, type DataProjectPublication } from "../../data-project";
import { BlockShell, SettingsSurface } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useBylineEditorHost, useDataProjectChoice } from "../host";
import { BlockIcon } from "../icons";
import { useSearch } from "./relations";
import { useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

/** Wide enough for a title, a status and a line of description, never wider than the screen. */
const PICKER_WIDTH = "w-[min(32rem,calc(100vw-2rem))]";

const STATUS_LABEL: Record<DataProjectPublication, string> = { published: "Published", changed: "Unpublished changes", draft: "Draft" };

function StatusBadge({ publication }: { publication: DataProjectPublication }) {
  // Quiet by design: a draft is ordinary preparation, never an alarm.
  return <Badge variant={publication === "published" ? "secondary" : "outline"} data-publication={publication}>{STATUS_LABEL[publication]}</Badge>;
}

function useFormatDate() {
  const { locale, timeZone } = useBylineEditorHost();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(locale ?? "en-US", { month: "short", day: "numeric", timeZone: timeZone ?? "UTC" });
    return (iso: string) => format.format(new Date(iso));
  }, [locale, timeZone]);
}

function ProjectRow({ project, onSelect }: { project: DataProjectChoice; onSelect: () => void }) {
  const formatDate = useFormatDate();
  return (
    <CommandItem value={String(project.id)} onSelect={onSelect} className="items-start gap-3 py-2" data-data-project-id={project.id}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-medium">{project.title}</span>
          <StatusBadge publication={project.publication} />
        </span>
        <span className="text-xs text-muted-foreground">{project.presentation.name}</span>
        {project.deck ? <span className="line-clamp-2 text-xs text-muted-foreground">{project.deck}</span> : null}
        {project.dataUpdatedAt ? <span className="text-xs text-muted-foreground">Data updated {formatDate(project.dataUpdatedAt)}</span> : null}
      </span>
    </CommandItem>
  );
}

/**
 * Choose an existing Data Project. Same composition as the Story, Poll and
 * Event pickers: a Popover with a mouse, a bottom Sheet on touch, a Command
 * list inside. Drafts are listed (a reporter may prepare a story before the
 * project is published) but are never hidden from, or confused with, what
 * readers can see.
 */
export function DataProjectPicker({ onChoose, trigger, title }: { onChoose: (project: DataProjectChoice) => void; trigger: React.ReactElement; title: string }) {
  const { searchDataProjects, dataProjects, dataWorkspaceHref } = useBylineEditorHost();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { items, loading, failed } = useSearch(searchDataProjects, query, open, attempt);
  const groups = useMemo(() => groupDataProjects(items), [items]);
  const choose = (project: DataProjectChoice) => {
    dataProjects.prime([{ id: project.id, value: project }]);
    onChoose(project);
    setOpen(false);
    setQuery("");
  };
  return (
    <SettingsSurface open={open} onOpenChange={setOpen} title={title} description="Published projects are what readers see. Nothing is added until you choose it." trigger={trigger} contentClassName={PICKER_WIDTH}>
      <Command shouldFilter={false} loop className="byline-inserter" data-data-project-picker="">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search by title, description or presentation" aria-label="Search Data Projects" />
        <CommandList className="max-h-[min(50dvh,24rem)]">
          {loading ? <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status"><Spinner />Searching…</div> : null}
          {failed ? (
            <div className="flex items-center justify-between gap-3 p-3 text-sm" role="alert">
              <span>The search didn't finish. Try again.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
            </div>
          ) : null}
          {!loading && !failed ? <CommandEmpty>{query.trim() ? "No Data Project matches." : "No Data Projects yet."}</CommandEmpty> : null}
          {groups.map((group) => (
            <CommandGroup key={group.publication} heading={group.heading}>
              {group.items.map((project) => <ProjectRow key={project.id} project={project} onSelect={() => choose(project)} />)}
            </CommandGroup>
          ))}
        </CommandList>
        {dataWorkspaceHref ? (
          <div className="border-t p-1.5">
            <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={dataWorkspaceHref} target="_blank" rel="noreferrer">
              Open Data
              <ExternalLink />
            </a>
          </div>
        ) : null}
      </Command>
    </SettingsSurface>
  );
}

/** The writer-facing note for a project's state, in the words a reporter needs (the generic readiness text names no cause). */
function statusIssues(issues: readonly BlockIssue[], status: "loading" | "ready" | "missing", publication: DataProjectPublication | null): readonly BlockIssue[] {
  return issues.map((issue) => {
    if (issue.code !== "data-project-unavailable") return issue;
    if (status === "missing") return { ...issue, message: "This Data Project is no longer available. Choose another." };
    if (publication === "draft") return { ...issue, message: "Publish this Data Project before publishing the story." };
    return issue;
  });
}

/**
 * Data Project: a published Byline Data Project, drawn in the story the way
 * readers will see it. The block stores only the project's ID and this
 * story's own heading and description; the data, its releases and the
 * presentation always come from the project itself.
 */
export function DataProjectEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("dataProject", node);
  const issues = useReadiness("dataProject", id, node.fields);
  const announce = useAnnounce();
  const { renderDataProject, dataProjectHref, dataProjects, timeZone, locale } = useBylineEditorHost();
  const entry = useDataProjectChoice(fields.project);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, chooseRef);
  const readOnly = !node.editable;
  const project = entry.asset;
  const formatDate = useFormatDate();

  const choose = (chosen: DataProjectChoice) => {
    // What the previous project would have filled in, so only untouched copy follows the new choice.
    const previous = fields.project === null ? null : dataProjects.get(fields.project).asset;
    set(dataProjectSelection(fields, previous ? { title: previous.title, deck: previous.deck } : null, chosen));
    announce(`${chosen.title} chosen.`);
    if (fields.project === null) window.requestAnimationFrame(() => titleRef.current?.focus());
  };

  const replace = (label: string) => (
    <DataProjectPicker title="Replace the Data Project" onChoose={choose} trigger={<Button type="button" variant="ghost" size="sm"><Replace />{label}</Button>} />
  );

  return (
    <BlockShell
      type="dataProject"
      node={node}
      issues={fields.project === null ? [] : statusIssues(issues, entry.status, project?.publication ?? null)}
      actions={fields.project !== null ? (
        <ButtonGroup>
          {replace("Replace project")}
          {dataProjectHref && project ? (
            <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={dataProjectHref(fields.project)} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open project
            </a>
          ) : null}
        </ButtonGroup>
      ) : null}
    >
      {fields.project === null ? (
        <Empty className="byline-media-empty" data-byline-chrome="" contentEditable={false}>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BlockIcon icon="database" /></EmptyMedia>
            <EmptyTitle>Choose a Data Project</EmptyTitle>
            <EmptyDescription>Show a project from Data inside this story. Its rows, releases and design stay in the project.</EmptyDescription>
          </EmptyHeader>
          {readOnly ? null : <DataProjectPicker title="Choose a Data Project" onChoose={choose} trigger={<Button ref={chooseRef} type="button" size="sm">Choose a Data Project</Button>} />}
        </Empty>
      ) : project ? (
        <DataProjectFigure
          headingId={`${id}-heading`}
          publication={project.publication}
          title={<InlineText inputRef={titleRef} label="Heading" placeholder="What this data shows" value={fields.title} maxLength={LIMITS.dataProjectTitle} readOnly={readOnly} onChange={(value) => set({ title: value })} />}
          description={<InlineText label="Description" placeholder="Where things stand, in a sentence or two, for readers who cannot use the data." value={fields.description} maxLength={LIMITS.dataProjectDescription} readOnly={readOnly} multiline onChange={(value) => set({ description: value })} />}
          footer={
            <>
              {project.dataUpdatedAt ? <span>Data updated <time dateTime={project.dataUpdatedAt}>{new Intl.DateTimeFormat(locale ?? "en-US", { dateStyle: "medium", timeZone: timeZone ?? "UTC" }).format(new Date(project.dataUpdatedAt))}</time></span> : null}
              {project.publication !== "draft" && project.publicUrl ? <a href={project.publicUrl} target="_blank" rel="noreferrer">View full data project</a> : null}
            </>
          }
        >
          <div className="byline-data-project-status" data-byline-chrome="" contentEditable={false}>
            <StatusBadge publication={project.publication} />
            <span>
              {project.publication === "draft" ? "Draft Data Project · not yet publishable" : project.publication === "changed" ? "This project has unpublished changes. Readers will see its published version." : `${project.presentation.name}${project.dataUpdatedAt ? ` · data updated ${formatDate(project.dataUpdatedAt)}` : ""}`}
            </span>
          </div>
          <div className="byline-data-project-stage" data-byline-chrome="" contentEditable={false}>
            {renderDataProject ? renderDataProject(project) : (
              <div className="byline-tracker-standin">
                <BlockIcon icon="database" />
                <span>{project.presentation.name}: shown here in Preview and on the published story.</span>
              </div>
            )}
          </div>
        </DataProjectFigure>
      ) : (
        <div className="byline-media-status" data-status={entry.status} role={entry.status === "missing" ? "alert" : undefined}>
          {entry.status === "loading" ? <Spinner /> : null}
          <span>{entry.status === "loading" ? "Loading…" : "This Data Project is no longer available. Choose another."}</span>
        </div>
      )}
    </BlockShell>
  );
}
