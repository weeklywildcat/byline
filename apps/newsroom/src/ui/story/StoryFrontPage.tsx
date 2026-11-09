"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getJson, postJson } from "./api";
import { SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";

type StoryFrontPageState = { canFeature: boolean; live: string | null; pending: { slot: string | null; label: string | null } | null; featured: Array<{ id: string; label: string; currently: string | null }> };

/**
 * A published Story's homepage status and "Feature on homepage…". Choosing a
 * slot makes the same pending Front Page change as the desk (one placement
 * path); it goes live when an editor publishes homepage changes.
 */
export function StoryFrontPage({ context }: { context: StoryScreenContext }) {
  const storyId = Number(context.storyId);
  const queries = useQueryClient();
  const [open, setOpen] = useState(false);
  const state = useQuery({ queryKey: ["byline", "story-front-page", storyId], queryFn: () => getJson<StoryFrontPageState>(context.api, `/byline/stories/${storyId}/front-page`) });
  const feature = useMutation({
    mutationFn: (slot: string) => postJson(context.api, `/byline/stories/${storyId}/front-page`, { slot }),
    onSuccess: async () => { setOpen(false); toast.success("Added to the homepage's pending changes. Publish them on Front Page."); await queries.invalidateQueries({ queryKey: ["byline", "story-front-page", storyId] }); },
    onError: (error: Error) => toast.error(error.message)
  });
  const data = state.data;
  return (
    <section className="grid gap-2 border-t pt-4" aria-label="Front page">
      <SectionHeading>Front page</SectionHeading>
      <p className="text-sm" role="status">
        {!data ? "Loading…" : data.live ? `Pinned as ${data.live}` : "Automatic"}
        {data?.pending?.label ? ` · Pending: ${data.pending.label}` : data?.pending ? " · Pending: back to automatic" : ""}
      </p>
      {data?.canFeature && !context.readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>Feature on homepage…</PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <Command>
                <CommandList>
                  <CommandGroup heading="Feature this story as">
                    {data.featured.map((slot) => (
                      <CommandItem key={slot.id} value={slot.id} onSelect={() => feature.mutate(slot.id)} disabled={feature.isPending}>
                        <span className="min-w-0"><span className="block">{slot.label}</span>{slot.currently ? <span className="block truncate text-xs text-muted-foreground">Replaces “{slot.currently}”</span> : <span className="block text-xs text-muted-foreground">Currently automatic</span>}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button type="button" variant="ghost" size="sm" render={<a href={`${context.admin}/front-page`} />}>Open Front Page</Button>
        </div>
      ) : null}
    </section>
  );
}
