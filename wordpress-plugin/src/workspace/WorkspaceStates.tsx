import { Button } from "../home/ui/button";
import { Skeleton } from "../home/ui/skeleton";
import type { WorkspaceError } from "./workspace-errors";

export function WorkspaceSkeleton() {
  return <div className="ws-page" aria-busy="true" aria-label="Loading the story workspace">
    <div className="ws-header"><Skeleton className="h-3 w-16" /><Skeleton className="mt-4 h-7 w-3/5" /><Skeleton className="mt-3 h-3 w-2/5" /><Skeleton className="mt-2 h-3 w-1/3" /></div>
    <div className="ws-body">
      <div className="ws-main">{[0, 1, 2].map((i) => <div key={i} className="ws-section"><Skeleton className="h-3 w-28" />{[0, 1, 2].map((j) => <div key={j} className="ws-skeleton-row"><Skeleton className="h-3 w-2/3" /><Skeleton className="mt-2 h-2.5 w-1/3" /></div>)}</div>)}</div>
      <div className="ws-rail">{[0, 1].map((i) => <div key={i} className="ws-section"><Skeleton className="h-3 w-20" />{[0, 1, 2, 3].map((j) => <div key={j} className="ws-skeleton-row"><Skeleton className="h-3 w-3/4" /></div>)}</div>)}</div>
    </div>
  </div>;
}

export function WorkspaceLoadError({ error, storiesUrl, onRetry, retrying }: { error: WorkspaceError; storiesUrl: string; onRetry: () => void; retrying: boolean }) {
  const message = error.forbidden ? "You are not part of this story." : error.notFound ? "This story couldn't be found. It may have been deleted." : error.message || "The story workspace couldn't be loaded.";
  return <div className="ws-page ws-load-error" role="alert">
    <h1>{error.forbidden ? "No access" : "The workspace couldn't load"}</h1>
    <p>{message}</p>
    <div className="ws-load-actions">
      {error.forbidden || error.notFound ? null : <Button onClick={onRetry} disabled={retrying}>{retrying ? "Retrying…" : "Retry"}</Button>}
      <Button variant="outline" render={<a href={storiesUrl} />}>Back to Stories</Button>
    </div>
  </div>;
}
