"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Item, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { Check, ChevronRight, Circle, CircleDot, MinusCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { ReviewCommentView, ReviewStepView } from "./api";

/** "Nov 9 at 10:43 AM" in the newsroom timezone. */
export function when(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  return `${day} at ${time}`;
}

export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const STEP_TEXT: Record<ReviewStepView["state"], string> = { approved: "Approved", active: "In review", pending: "Waiting", skipped: "Skipped", stale: "Needs another look" };

function stepIcon(state: ReviewStepView["state"]) {
  if (state === "approved") return <Check aria-hidden="true" />;
  if (state === "active") return <CircleDot aria-hidden="true" />;
  if (state === "skipped") return <MinusCircle aria-hidden="true" />;
  if (state === "stale") return <RotateCcw aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

/**
 * The review pipeline (docs/review.md#pipeline): ordered gates as Items with
 * a quiet connecting line. Each status is a word and an icon, never only a
 * colour. Not a Trace: these are newsroom steps, not an agent's reasoning.
 */
export function ReviewPipeline({ steps }: { steps: ReviewStepView[] }) {
  return (
    <ol className="relative flex flex-col" aria-label="Review steps" data-review-pipeline="">
      {steps.map((step, index) => {
        const who = step.state === "approved" ? step.approval?.by?.name : step.assignee?.name ?? (step.queueSize > 1 ? `${step.waitingFor ?? step.via} · ${step.queueSize} eligible reviewers` : step.waitingFor);
        const detail = step.state === "skipped" ? step.skipReason : step.state === "stale" ? step.staleReason : step.via && step.via !== who ? step.via : null;
        return (
          <li key={step.stepId} className="relative" data-step-state={step.state}>
            {index < steps.length - 1 ? <span aria-hidden="true" className="absolute top-8 bottom-0 left-[1.0625rem] w-px bg-border" /> : null}
            <Item size="xs" className="px-0">
              <ItemMedia variant="icon" className={step.state === "active" ? "size-9 rounded-full bg-primary/10 text-primary" : step.state === "stale" ? "size-9 rounded-full bg-warning/10 text-warning" : "size-9 rounded-full bg-muted text-muted-foreground"}>{stepIcon(step.state)}</ItemMedia>
              <ItemContent>
                <ItemTitle>{step.label}<span className="font-normal text-muted-foreground"> · {STEP_TEXT[step.state]}</span></ItemTitle>
                {who ? <ItemDescription>{who}</ItemDescription> : null}
                {detail ? <ItemDescription>{detail}</ItemDescription> : null}
              </ItemContent>
            </Item>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Review comments as threads (Items): the quoted submitted words, the
 * comment, who and when, replies. Resolved threads fold away. Not chat
 * bubbles: these are annotations on a version.
 */
export function ReviewThreads({ threads, timeZone, canReply, onReply, onResolve, onRemove, focused }: {
  threads: ReviewCommentView[];
  timeZone: string;
  canReply: boolean;
  onReply?: (thread: ReviewCommentView, body: string) => void;
  onResolve?: (thread: ReviewCommentView, resolved: boolean) => void;
  onRemove?: (thread: ReviewCommentView) => void;
  focused?: number | null;
}) {
  const open = threads.filter((thread) => thread.state !== "resolved");
  const resolved = threads.filter((thread) => thread.state === "resolved");
  return (
    <div className="flex flex-col gap-2">
      {open.length ? <ItemGroup className="gap-2">{open.map((thread) => <Thread key={thread.id} thread={thread} timeZone={timeZone} canReply={canReply} onReply={onReply} onResolve={onResolve} onRemove={onRemove} focused={focused === thread.id} />)}</ItemGroup> : null}
      {resolved.length ? (
        <Collapsible>
          <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" />}>
            <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform in-data-panel-open:rotate-90" />{resolved.length} resolved
          </CollapsibleTrigger>
          <CollapsibleContent><ItemGroup className="gap-2 pt-2">{resolved.map((thread) => <Thread key={thread.id} thread={thread} timeZone={timeZone} canReply={false} onResolve={onResolve} focused={focused === thread.id} />)}</ItemGroup></CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function Thread({ thread, timeZone, canReply, onReply, onResolve, onRemove, focused }: { thread: ReviewCommentView; timeZone: string; canReply: boolean; onReply?: (thread: ReviewCommentView, body: string) => void; onResolve?: (thread: ReviewCommentView, resolved: boolean) => void; onRemove?: (thread: ReviewCommentView) => void; focused: boolean }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  return (
    <Item variant="outline" size="sm" className={focused ? "flex-col items-stretch ring-2 ring-ring/40" : "flex-col items-stretch"} data-review-thread={thread.id} data-thread-state={thread.state}>
      <ItemContent className="gap-1.5">
        {thread.quote ? <blockquote className="border-l-2 border-border pl-2 text-xs text-muted-foreground italic">“{thread.quote}”</blockquote> : null}
        <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{thread.body}</p>
        <ItemDescription>{thread.author?.name ?? "Someone"} · {thread.state === "pending" ? "Not sent yet" : when(thread.publishedAt ?? thread.createdAt, timeZone)}</ItemDescription>
        {thread.replies.map((reply) => (
          <div key={reply.id} className="border-l border-border pl-3">
            <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
            <p className="text-xs text-muted-foreground">{reply.author?.name ?? "Someone"} · {when(reply.createdAt, timeZone)}</p>
          </div>
        ))}
      </ItemContent>
      <ItemFooter className="flex-wrap justify-start gap-1">
        {thread.state === "pending" && onRemove ? <Button type="button" size="xs" variant="ghost" onClick={() => onRemove(thread)}>Remove</Button> : null}
        {thread.state === "published" && canReply && onReply && !replying ? <Button type="button" size="xs" variant="ghost" onClick={() => setReplying(true)}>Reply</Button> : null}
        {thread.state !== "pending" && onResolve ? <Button type="button" size="xs" variant="ghost" onClick={() => onResolve(thread, thread.state !== "resolved")}>{thread.state === "resolved" ? "Reopen" : "Resolve"}</Button> : null}
      </ItemFooter>
      {replying ? (
        <form className="flex w-full flex-col gap-2" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); if (text.trim()) { onReply?.(thread, text.trim()); setText(""); setReplying(false); } }}>
          <Textarea rows={2} value={text} autoFocus aria-label="Reply" onChange={(event) => setText(event.target.value)} />
          <div className="flex justify-end gap-2"><Button type="button" size="xs" variant="ghost" onClick={() => setReplying(false)}>Cancel</Button><Button type="submit" size="xs" disabled={!text.trim()}>Reply</Button></div>
        </form>
      ) : null}
    </Item>
  );
}
