import type { ReactNode } from "react";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { RowSkeletons } from "../story/rows";
import type { OptionalQuery } from "./planning-query";

/** The compact header every Planning destination shares with Home and the Story Workspace. */
/** `tour`: a stable anchor a newsroom tour may point at (`data-byline-tour`). */
export function PageHeader({ title, description, actions, tour }: { title: string; description?: string; actions?: ReactNode; tour?: string }) {
  return <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-byline-tour={tour}>
    <div>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </header>;
}

/**
 * Secondary destinations share one failure policy: a skeleton while loading, a
 * plain message with Try again when the data is unavailable, and the content
 * otherwise. An unavailable destination never takes anything else down.
 */
export function ResourceGate<T>({ query, label, children }: { query: OptionalQuery<T>; label: string; children: (data: T) => ReactNode }) {
  if (query.isLoading) return <div role="status" aria-label={`Loading ${label}`} className="pt-2"><RowSkeletons count={5} /></div>;
  if (query.data === undefined) {
    return <Empty className="border"><EmptyHeader><EmptyTitle>{label}</EmptyTitle><EmptyDescription>{query.error || `${label} is unavailable right now.`}</EmptyDescription></EmptyHeader>{query.available || query.error ? <EmptyContent><Button variant="outline" onClick={query.refetch}>Try again</Button></EmptyContent> : null}</Empty>;
  }
  return <>{children(query.data)}</>;
}

/** What a filtered collection says when nothing matches, or when there is nothing yet. */
export function NothingHere({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Empty className="border"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action ? <EmptyContent>{action}</EmptyContent> : null}</Empty>;
}
