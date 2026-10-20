import { CircleAlert } from "lucide-react";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { Card, CardContent } from "../admin-ui/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../admin-ui/ui/empty";
import { Skeleton } from "../admin-ui/ui/skeleton";
import type { WorkspaceError } from "./workspace-errors";

function SkeletonRows({ count, lines = 2 }: { count: number; lines?: number }) {
  return <div className="flex flex-col gap-4">{Array.from({ length: count }, (_, i) => <div key={i} className="flex flex-col gap-2"><Skeleton className="h-4 w-2/3" />{lines > 1 ? <Skeleton className="h-3 w-1/3" /> : null}</div>)}</div>;
}

export function WorkspaceSkeleton() {
  return <main aria-busy="true" aria-label="Loading the story workspace" className="@container/ws mx-auto mt-3 mb-8 flex max-w-[1320px] flex-col gap-6 pr-5">
    <div className="flex flex-col gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-8 w-3/5" /><Skeleton className="h-4 w-2/5" /></div>
    <div className="flex flex-col gap-4 @3xl/ws:grid @3xl/ws:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] @3xl/ws:items-start @3xl/ws:gap-5">
      <div className="flex flex-col gap-4">{[0, 1, 2].map((i) => <Card key={i} size="sm"><CardContent><SkeletonRows count={3} /></CardContent></Card>)}</div>
      <div className="flex flex-col gap-4">{[0, 1].map((i) => <Card key={i} size="sm"><CardContent><SkeletonRows count={4} lines={1} /></CardContent></Card>)}</div>
    </div>
  </main>;
}

export function WorkspaceLoadError({ error, storiesUrl, onRetry, retrying }: { error: WorkspaceError; storiesUrl: string; onRetry: () => void; retrying: boolean }) {
  const message = error.forbidden ? "You are not part of this story." : error.notFound ? "This story couldn't be found. It may have been deleted." : error.message || "The story workspace couldn't be loaded.";
  return <main className="mx-auto mt-10 max-w-xl pr-5">
    <Empty role="alert" className="border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon"><CircleAlert aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{error.forbidden ? "No access" : "The workspace couldn't load"}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        {error.forbidden || error.notFound ? null : <Button onClick={onRetry} disabled={retrying}>{retrying ? "Retrying…" : "Retry"}</Button>}
        <a className={buttonVariants({ variant: "outline" })} href={storiesUrl}>Back to Stories</a>
      </EmptyContent>
    </Empty>
  </main>;
}
