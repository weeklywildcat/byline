"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { StoryScreenContext } from "../story/StoryScreen";
import { useReviewActions, useStoryReview } from "./api";
import { ago, ReviewThreads } from "./ReviewParts";

/**
 * Review feedback for the writer (docs/review.md#feedback): first in Story
 * Context when an editor asked for changes, and a right Sheet beside the
 * editable article with the comments. The quotes are the submitted words,
 * shown as they were: a rewritten paragraph is never silently re-anchored.
 */
export function FeedbackSummary({ context }: { context: StoryScreenContext }) {
  const review = useStoryReview(context);
  const actions = useReviewActions(context);
  const [open, setOpen] = useState(false);
  const state = review.data;
  const run = state?.run;
  if (!state || !run || run.status !== "changes-requested") return null;
  const last = [...run.decisions].reverse().find((decision) => decision.decision === "changes-requested");
  const threads = state.comments.filter((comment) => comment.state !== "pending" && comment.round === last?.round);
  const count = threads.length;
  return (
    <section aria-labelledby="context-feedback" className="flex flex-col gap-2" data-context-section="feedback">
      <h2 id="context-feedback" className="text-xs font-medium tracking-wide text-destructive uppercase">Review feedback</h2>
      <Item size="xs" variant="muted">
        <ItemContent>
          <ItemTitle>{last?.by?.name ?? "An editor"} · {last ? ago(last.at) : ""}</ItemTitle>
          <ItemDescription>{count ? `${count} ${count === 1 ? "comment" : "comments"}` : last?.summary ? last.summary : "Changes requested"}</ItemDescription>
        </ItemContent>
        <ItemActions><Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-open-feedback="">View feedback<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button></ItemActions>
      </Item>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>Review feedback</SheetTitle>
            <SheetDescription>Quotes are from the version you submitted. Fix the story, then resubmit.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4">
            {last?.summary ? <p className="text-sm whitespace-pre-wrap">{last.summary}</p> : null}
            <ReviewThreads threads={threads} timeZone={context.timeZone} canReply
              onReply={(thread, body) => actions.comment.mutate({ parent: thread.id, body })}
              onResolve={(thread, resolved) => actions.editComment.mutate({ id: thread.id, resolved })} />
            {!threads.length && !last?.summary ? <p className="text-sm text-muted-foreground">No comments were left. Ask your editor what to change.</p> : null}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
