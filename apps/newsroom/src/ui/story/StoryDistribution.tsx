"use client";

import type { DistributionPayload } from "@byline/newsroom-screens/editorial/editorial-rest";
import { Button } from "@byline/newsroom-ui/ui/button";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getJson } from "./api";
import { SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";

export function StoryDistribution({ context }: { context: StoryScreenContext }) {
  const query = useQuery({ queryKey: ["byline", "story-distribution", context.storyId], queryFn: () => getJson<DistributionPayload>(context.api, `/byline/stories/${context.storyId}/distribution`) });
  const data = query.data;
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success("Copied."), () => toast.error("Byline could not copy to the clipboard."));
  return <section className="grid gap-2 border-t pt-4" aria-label="Distribution">
    <SectionHeading>Distribution</SectionHeading>
    {query.isError ? <p role="status" className="text-sm text-muted-foreground">{(query.error as Error).message}</p> : !data ? <p role="status" className="text-sm">Loading public address…</p> : <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => copy([data.headline, data.excerpt, data.canonicalUrl].filter(Boolean).join("\n\n"))}>Copy caption</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => copy(`${data.headline}\n${data.canonicalUrl}`)}>Copy headline + URL</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => copy(data.canonicalUrl)}>Copy canonical URL</Button>
    </div>}
  </section>;
}
