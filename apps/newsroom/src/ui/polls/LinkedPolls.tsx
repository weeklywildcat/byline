"use client";

import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Vote } from "lucide-react";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";
import { fetchLinkedPolls, pollKeys, STATUS_LABEL } from "./api";

/**
 * The polls linked to a Story or Collection, where that coverage is worked
 * on. Poll Studio stays the one authority: this only reads its links, shows
 * each poll as the account may see it (responses only with results access),
 * and opens Poll Studio. It renders nothing when there's nothing to show,
 * and it doesn't load the survey engine.
 */
export function LinkedPolls({ kind, id, headingClassName }: { kind: "story" | "collection"; id: number; headingClassName?: string }) {
  const { api, admin } = useNewsroomRoutes();
  const linked = useQuery({ queryKey: pollKeys.linked(kind, id), queryFn: () => fetchLinkedPolls(api, kind, id), enabled: Number.isSafeInteger(id) && id > 0, staleTime: 60_000, retry: false });
  const polls = linked.data?.polls ?? [];
  if (!polls.length) return null;
  const headingId = `linked-polls-${kind}-${id}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-1" data-linked-polls={kind}>
      <h3 id={headingId} className={headingClassName ?? "text-xs font-medium tracking-wide text-muted-foreground uppercase"}>Polls</h3>
      <ItemGroup className="gap-0 divide-y border-y">
        {polls.map((poll) => (
          <Item key={poll.id} size="xs" className="rounded-none px-0" render={<ShellLink href={`${admin}/polls?poll=${poll.id}`} />}>
            <ItemMedia variant="icon"><Vote /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="flex-wrap">{poll.title}<StatusBadge tone={poll.status === "open" ? "done" : "neutral"}>{STATUS_LABEL[poll.status] ?? poll.status}</StatusBadge></ItemTitle>
              <ItemDescription className="tabular-nums">
                {[
                  poll.responses !== null ? `${poll.responses.toLocaleString("en-US")} ${poll.responses === 1 ? "response" : "responses"}` : null,
                  poll.activeSessions ? `${poll.activeSessions} ${poll.activeSessions === 1 ? "session" : "sessions"} running` : null,
                  poll.publicLink ? "web link on" : null
                ].filter(Boolean).join(" · ") || "Open in Poll Studio"}
              </ItemDescription>
            </ItemContent>
            <ItemActions><ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}
