"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Copy, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { StoryDistributionView } from "../../distribution/server";
import { DistributionSheet, DistributionStateBadge } from "../distribution/DistributionSheet";
import { getJson, postJson } from "./api";
import { SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error("Byline could not copy to the clipboard."));

/**
 * Where this Story still needs to go: one restrained row per destination
 * (state, what it inherits, owner, the next step). A row opens the same
 * detail Sheet as the global desk; routine work never leaves the Story.
 */
export function StoryDistribution({ context }: { context: StoryScreenContext }) {
  const storyId = Number(context.storyId);
  const queries = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const query = useQuery({ queryKey: ["byline", "story-distribution", storyId], queryFn: () => getJson<StoryDistributionView>(context.api, `/byline/stories/${storyId}/distribution`) });
  const data = query.data;
  // A notification link opens its item (?distribution=<id>).
  useEffect(() => {
    const requested = Number(new URLSearchParams(window.location.search).get("distribution"));
    if (Number.isSafeInteger(requested) && requested > 0) setOpen(requested);
  }, []);
  const add = useMutation({
    mutationFn: (destination: string) => postJson<{ id: number }>(context.api, `/byline/stories/${storyId}/distribution`, { destination }),
    onSuccess: async (created) => { await queries.invalidateQueries({ queryKey: ["byline", "story-distribution", storyId] }); setOpen(created.id); },
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <section className="grid gap-2 border-t pt-4" aria-label="Distribution">
      <SectionHeading action={data?.canAdd && !context.readOnly && data.addable.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" disabled={add.isPending} />}><Plus data-icon="inline-start" />Add destination</DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {data.addable.map((option) => <DropdownMenuItem key={option.kind} onClick={() => add.mutate(option.kind)}>{option.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}>Distribution</SectionHeading>

      {query.isError ? <p role="status" className="text-sm text-muted-foreground">{(query.error as Error).message}</p> : !data ? <p role="status" className="text-sm">Loading…</p> : <>
        {!data.story.published ? <p className="text-sm text-muted-foreground" role="status">{data.story.everPublished ? "This Story is unpublished. Nothing new goes out until it is published again; what already went out is kept below." : "Publish the Story and its destinations are prepared here."}</p> : null}
        {data.items.length ? (
          <ItemGroup className="gap-1.5">
            {data.items.map((item) => (
              <Item key={item.id} variant="outline" size="sm">
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex flex-wrap items-center gap-2">{item.label}<DistributionStateBadge state={item.state} label={item.attention && item.state !== "failed" ? item.attention : item.stateLabel} /></ItemTitle>
                  <ItemDescription className="[overflow-wrap:anywhere]">
                    {item.state === "posted" ? `${item.destination.postedLabel}${item.postedBy ? ` by ${item.postedBy.name}` : ""}` : item.summary}
                    {item.owner ? ` · Owner: ${item.owner.name}` : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button type="button" variant="ghost" size="sm" aria-label={`${item.nextAction} ${item.label}`} onClick={() => setOpen(item.id)}>{item.nextAction}<ChevronRight data-icon="inline-end" /></Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : data.story.published ? <p className="text-sm text-muted-foreground">No destinations yet.{data.canAdd ? " Add one when it needs to go somewhere." : ""}</p> : null}
        {data.suggestions.length ? <p className="text-xs text-muted-foreground">{data.story.published ? "Also suggested" : "Prepared when published"}: {data.suggestions.map((entry) => entry.label).join(", ")}.</p> : null}
        {data.story.published && data.copy.canonicalUrl ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">Copy</span>
            <ButtonGroup>
              <Button type="button" variant="ghost" size="xs" onClick={() => copy([data.copy.headline, data.copy.excerpt, data.copy.canonicalUrl].filter(Boolean).join("\n\n"), "Caption")}><Copy data-icon="inline-start" />Caption</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => copy(`${data.copy.headline}\n${data.copy.canonicalUrl}`, "Headline and link")}>Headline + URL</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => copy(data.copy.canonicalUrl!, "Link")}>URL</Button>
            </ButtonGroup>
          </div>
        ) : null}
      </>}
      <DistributionSheet api={context.api} itemId={open} timeZone={context.timeZone} userId={Number(context.userId)} onClose={() => setOpen(null)} />
    </section>
  );
}
