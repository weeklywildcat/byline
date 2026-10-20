import type { ReactNode } from "react";
import { __ } from "@wordpress/i18n";
import { Button } from "../admin-ui/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { RowSkeletons } from "../story/rows";
import type { OptionalQuery } from "./planning-query";

/** The compact header every Planning destination shares with Home and the Story Workspace. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
  if (query.isLoading) return <div role="status" aria-label={`${__("Loading", "weekly-wildcat-headless")} ${label}`} className="pt-2"><RowSkeletons count={5} /></div>;
  if (query.data === undefined) {
    return <Empty className="border"><EmptyHeader><EmptyTitle>{label}</EmptyTitle><EmptyDescription>{query.error || `${label} ${__("is unavailable right now.", "weekly-wildcat-headless")}`}</EmptyDescription></EmptyHeader>{query.available || query.error ? <EmptyContent><Button variant="outline" onClick={query.refetch}>{__("Try again", "weekly-wildcat-headless")}</Button></EmptyContent> : null}</Empty>;
  }
  return <>{children(query.data)}</>;
}

/** What a filtered collection says when nothing matches, or when there is nothing yet. */
export function NothingHere({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Empty className="border"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action ? <EmptyContent>{action}</EmptyContent> : null}</Empty>;
}
