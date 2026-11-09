"use client";

import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Popover, PopoverContent } from "@byline/newsroom-ui/ui/popover";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, PanelRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getJson } from "../story/api";
import { FocusedHeader } from "../story/StoryHeader";
import type { StoryScreenContext } from "../story/StoryScreen";
import type { SubmittedMedia } from "../../newsroom/review";
import { useReviewActions, useStoryReview, type ReviewCommentView, type ReviewState } from "./api";
import { ReviewPipeline, ReviewThreads, when } from "./ReviewParts";
import { reviewBlocks, selectionAnchor, SubmittedArticle, type BlockMark, type SubmittedStory } from "./SubmittedArticle";

/** Width of the Review area above which the review rail sits beside the article (as the Story's context rail). */
const REVIEW_RAIL_AT = 1180;

type Anchor = { block: string; start: number; end: number; quote: string; rect: DOMRect };

/**
 * Review mode (docs/review.md#review-mode): the immutable submitted version
 * as the primary content, the review beside it (or in a Sheet on narrow
 * screens). Reached only by someone with a review to do — the header's
 * "Review submitted version" or a notification — never a tab.
 */
export function ReviewMode({ context, storyTitle, onBack, width }: { context: StoryScreenContext; storyTitle: string; onBack: () => void; width: number }) {
  const storyId = Number(context.storyId);
  const review = useStoryReview(context);
  const submitted = useQuery({
    queryKey: ["byline", "story-review-submitted", storyId, review.data?.run?.submittedVersion ?? null],
    queryFn: () => getJson<{ version: string; submittedAt: string; story: SubmittedStory | null; media: SubmittedMedia[] }>(context.api, `/byline/stories/${storyId}/review/submitted`),
    enabled: Boolean(review.data?.run)
  });
  const actions = useReviewActions(context);
  const articleRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState("");
  // "Whole story" is the submitted words, where comments are made; "Changes" is only what moved since this reviewer last looked.
  const [lens, setLens] = useState<"story" | "changes">("story");
  const wide = width >= REVIEW_RAIL_AT;

  const state = review.data;
  const run = state?.run ?? null;
  const blocks = useMemo(() => (submitted.data?.story ? reviewBlocks(submitted.data.story) : []), [submitted.data]);
  const files = useMemo(() => new Map((submitted.data?.media ?? []).map((file) => [file.id, file])), [submitted.data]);
  const comparison = review.data?.changesSinceYourReview?.comparison ?? null;
  const changes = useMemo(() => (comparison ? { blocks: new Map(comparison.blocks.map((change) => [change.id, change])), removed: comparison.removed } : null), [comparison]);
  const marks = useMemo(() => {
    const map = new Map<string, BlockMark[]>();
    const add = (comment: ReviewCommentView) => {
      const anchor = comment.anchor as { block?: string; start?: number; end?: number } | null;
      if (!anchor?.block || typeof anchor.start !== "number" || typeof anchor.end !== "number" || comment.round !== run?.round) return;
      map.set(anchor.block, [...(map.get(anchor.block) ?? []), { start: anchor.start, end: anchor.end, commentId: comment.id, pending: comment.state === "pending" }]);
    };
    for (const comment of state?.comments ?? []) add(comment);
    return map;
  }, [state?.comments, run?.round]);

  if (review.isPending) return <ReviewSkeleton />;
  if (!state || !run) {
    return <>
      <FocusedHeader title="Review" storyTitle={storyTitle} onBack={onBack} />
      <p className="text-sm text-muted-foreground">This story hasn't been sent for review.</p>
    </>;
  }

  const canDecide = state.viewer.canReview && run.status === "active";
  const mine = state.comments.filter((comment) => comment.state === "pending");
  const published = state.comments.filter((comment) => comment.state !== "pending");
  const busy = actions.decide.isPending || actions.claim.isPending;

  function onSelect() {
    // Comment anchors are offsets into the submitted words, which the Changes lens interleaves with deleted ones.
    if (!canDecide || lens !== "story" || !articleRef.current) return;
    const found = selectionAnchor(articleRef.current);
    if (found) { setAnchor(found); setDraft(""); }
  }

  function addComment() {
    if (!anchor || !draft.trim()) return;
    actions.comment.mutate({ quote: anchor.quote, anchor: { block: anchor.block, start: anchor.start, end: anchor.end }, body: draft.trim() }, {
      onSuccess: () => { setAnchor(null); setDraft(""); window.getSelection()?.removeAllRanges(); },
      onError: (error) => toast.error((error as Error).message)
    });
  }

  function decide(decision: "approve" | "request-changes", text?: string) {
    actions.decide.mutate({ decision, summary: text, expectedRevision: run!.revision }, {
      onSuccess: (next: ReviewState) => {
        setSummaryOpen(false);
        if (decision === "request-changes") toast.success("Changes requested. The writers have your feedback.");
        else if (next.run?.status === "approved") toast.success("Approved. The story is Ready.");
        else toast.success(`Approved and sent to ${next.run?.steps.find((step) => step.state === "active")?.waitingFor ?? "the next review"}.`);
        onBack();
      },
      onError: (error) => toast.error((error as Error).message)
    });
  }

  const panel = (
    <div className="flex flex-col gap-5" data-review-panel="">
      <section aria-labelledby="review-steps" className="flex flex-col gap-2">
        <h2 id="review-steps" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{run.workflowName || "Review"}</h2>
        <ReviewPipeline steps={run.steps} />
      </section>
      {state.changesSinceYourReview ? (
        <Alert data-changes-since="">
          <AlertTitle>Changes since your last review</AlertTitle>
          <AlertDescription>
            <span className="block">{state.changesSinceYourReview.summary}</span>
            {state.changesSinceYourReview.copySummary ? <span className="block">Text: {state.changesSinceYourReview.copySummary}.</span> : null}
            {state.changesSinceYourReview.visualSummary ? <span className="block">Visuals: {state.changesSinceYourReview.visualSummary}.</span> : null}
            {state.changesSinceYourReview.comparison && state.changesSinceYourReview.categories.length ? <Button type="button" size="xs" variant="link" className="h-auto p-0" onClick={() => setLens("changes")}>Show only what changed</Button> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {canDecide ? <>
        <Separator />
        <section aria-labelledby="review-yours" className="flex flex-col gap-2">
          <h2 id="review-yours" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your comments{mine.length ? ` · ${mine.length}` : ""}</h2>
          {mine.length
            ? <ReviewThreads threads={mine} timeZone={context.timeZone} canReply={false} focused={focused} onRemove={(thread) => actions.removeComment.mutate(thread.id)} />
            : <p className="text-sm text-muted-foreground">Select words in the story to comment on them. The writers see your comments when you decide.</p>}
          {state.viewer.mustClaim ? <Button type="button" variant="outline" size="sm" className="w-fit" disabled={busy} onClick={() => actions.claim.mutate(run.revision, { onError: (error) => toast.error((error as Error).message) })}>Take this review</Button> : null}
          <ButtonGroup aria-label="Review decision" className="pt-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => (mine.length ? decide("request-changes") : setSummaryOpen(true))} data-decision="request-changes">Request changes</Button>
            <Button type="button" disabled={busy} onClick={() => decide("approve")} data-decision="approve">{busy ? <Spinner data-icon="inline-start" /> : null}Approve &amp; send up</Button>
          </ButtonGroup>
        </section>
      </> : null}
      {published.length ? <>
        <Separator />
        <section aria-labelledby="review-threads" className="flex flex-col gap-2">
          <h2 id="review-threads" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Earlier feedback</h2>
          <ReviewThreads threads={published} timeZone={context.timeZone} canReply={canDecide} focused={focused}
            onReply={(thread, body) => actions.comment.mutate({ parent: thread.id, body })}
            onResolve={(thread, resolved) => actions.editComment.mutate({ id: thread.id, resolved })} />
        </section>
      </> : null}
    </div>
  );

  return (
    <>
      <FocusedHeader
        title="Review"
        storyTitle={storyTitle}
        onBack={onBack}
        actions={<>
          <span className="text-sm text-muted-foreground" data-submitted-at="">Submitted {when(run.submittedAt, context.timeZone)}{run.submittedBy ? ` by ${run.submittedBy.name}` : ""}</span>
          {run.newerDraft ? <Badge variant="outline" data-newer-draft="">A newer draft exists</Badge> : null}
          {!wide ? <Button type="button" variant="outline" size="sm" onClick={() => setPanelOpen(true)}><PanelRight data-icon="inline-start" aria-hidden="true" />Review{mine.length ? ` · ${mine.length}` : ""}</Button> : null}
        </>}
      />
      <div className={wide ? "grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-8" : undefined}>
        <div className="min-w-0">
        {changes ? (
          <div className="mb-4 flex flex-wrap items-center gap-3" data-review-lens="">
            <ToggleGroup variant="outline" size="sm" spacing={0} aria-label="What to read" value={[lens]} onValueChange={(next: unknown[]) => { if (next[0] === "story" || next[0] === "changes") setLens(next[0]); }}>
              <ToggleGroupItem value="story">Whole story</ToggleGroupItem>
              <ToggleGroupItem value="changes">Changes since your review</ToggleGroupItem>
            </ToggleGroup>
            {lens === "changes" ? <span className="text-sm text-muted-foreground">Switch to Whole story to comment.</span> : null}
          </div>
        ) : null}
        <div ref={articleRef} className="min-w-0" onMouseUp={onSelect} onKeyUp={(event) => { if (event.shiftKey) onSelect(); }}>
          {submitted.isPending ? <ReviewSkeleton /> : submitted.data?.story
            ? <SubmittedArticle blocks={blocks} marks={marks} media={files} changes={changes} changesOnly={lens === "changes"} onMark={(id) => { setFocused(id); if (!wide) setPanelOpen(true); }} />
            : <Alert><AlertTitle>The submitted version isn't available</AlertTitle><AlertDescription>It may have been removed from the story's history. Ask the writer to resubmit.</AlertDescription></Alert>}
        </div>
        </div>
        {wide ? <aside aria-label="Review" className="sticky top-24 min-w-0 border-l border-border pl-6">{panel}</aside> : null}
      </div>

      {!wide ? (
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="right" className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-sm">
            <SheetHeader className="border-b border-border pr-12"><SheetTitle>Review</SheetTitle><SheetDescription className="sr-only">Steps, your comments and the decision.</SheetDescription></SheetHeader>
            <div className="p-4">{panel}</div>
          </SheetContent>
        </Sheet>
      ) : null}

      {/* The lightweight comment composer, anchored to the selected words. */}
      <Popover open={anchor !== null} onOpenChange={(open) => { if (!open) setAnchor(null); }}>
        <PopoverContent anchor={anchor ? { getBoundingClientRect: () => anchor.rect } : undefined} side="bottom" align="start" className="w-80" data-comment-composer="">
          <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); addComment(); }}>
            <p className="line-clamp-2 border-l-2 border-border pl-2 text-xs text-muted-foreground italic">“{anchor?.quote}”</p>
            <Textarea rows={3} autoFocus value={draft} aria-label="Comment" placeholder="What should change?" onChange={(event) => setDraft(event.target.value)} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAnchor(null)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={!draft.trim() || actions.comment.isPending}><MessageSquarePlus data-icon="inline-start" aria-hidden="true" />Add comment</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      {/* Request changes without comments: an optional summary, in a focused Dialog. */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <form className="contents" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); decide("request-changes", summary.trim() || undefined); }}>
            <DialogHeader><DialogTitle>Request changes</DialogTitle><DialogDescription>You haven't left comments. Say what should change, or send it back as is.</DialogDescription></DialogHeader>
            <Field>
              <FieldLabel htmlFor="review-summary">What should change?</FieldLabel>
              <Textarea id="review-summary" rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} />
              <FieldDescription>Optional. The writers see it with the story.</FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSummaryOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={actions.decide.isPending}>Request changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewSkeleton() {
  return <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 py-6"><Skeleton className="h-9 w-3/4" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
}
