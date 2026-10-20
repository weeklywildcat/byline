import { ArrowUpRight, FileText } from "lucide-react";
import { PersonAvatar } from "../admin-ui/components/person-avatar";
import { AvatarGroup } from "../admin-ui/ui/avatar";
import { Badge } from "../admin-ui/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "../admin-ui/ui/breadcrumb";
import { buttonVariants } from "../admin-ui/ui/button";
import { writerNames } from "./workspace-model";
import { workingDraft } from "./resource-model";
import { useWorkspace } from "./workspace-context";

export function WorkspaceHeader() {
  const { data, storiesUrl, caps } = useWorkspace();
  const { story } = data;
  const writers = writerNames(data);
  const draft = workingDraft(data.resources);
  const preview = data.previewUrl;
  const title = story.title || "Untitled story";
  return <header className="flex flex-col gap-4">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink href={storiesUrl}>Stories</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate">{title}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <div className="flex flex-col gap-4 @2xl/ws:flex-row @2xl/ws:items-start @2xl/ws:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="font-heading text-2xl leading-tight font-semibold tracking-tight text-balance [overflow-wrap:anywhere]">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
          <Badge variant="secondary">{story.workflow.label}</Badge>
          {data.sections.length ? <span>{data.sections.join(", ")}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {writers.length ? <span className="flex items-center gap-2">
            <AvatarGroup>{data.contributors.contributors.slice(0, 3).map((person) => <PersonAvatar key={`${person.kind}:${person.id}`} name={person.name} url={person.imageUrl} />)}</AvatarGroup>
            {writers.join(", ")}
          </span> : <span>No writers yet</span>}
          {story.editor ? <span>Editor: {story.editor.name}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 @2xl/ws:shrink-0">
        {draft ? <a className={buttonVariants({ variant: "ghost" })} href={draft.url} target="_blank" rel="noopener noreferrer"><FileText data-icon="inline-start" aria-hidden="true" />Working draft<ArrowUpRight data-icon="inline-end" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : null}
        {preview ? <a className={buttonVariants({ variant: "outline" })} href={preview} target="_blank" rel="noopener noreferrer">Preview<ArrowUpRight data-icon="inline-end" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : null}
        {caps.editArticle && story.editUrl ? <a className={buttonVariants()} href={story.editUrl}>Edit article</a> : null}
      </div>
    </div>
  </header>;
}
