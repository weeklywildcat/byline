"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateStoryData } from "@byline/newsroom-screens/story/story-query";
import { workspaceKey } from "@byline/newsroom-screens/workspace/workspace-query";
import type { ReviewState } from "../../newsroom/review";
import { ApiError, getJson, patchJson, postJson, deleteJson } from "../story/api";
import type { StoryScreenContext } from "../story/StoryScreen";

export type { ReviewState, ReviewCommentView, ReviewStepView } from "../../newsroom/review";
export type SubmissionProblem = { field: "headline" | "section" | "contributors"; message: string };

export const reviewKey = (storyId: number) => ["byline", "story-review", storyId] as const;

/** The Story's review as this reader sees it (GET /api/byline/stories/:id/review). */
export function useStoryReview(context: Pick<StoryScreenContext, "api" | "storyId">, enabled = true) {
  const storyId = Number(context.storyId);
  return useQuery({
    queryKey: reviewKey(storyId),
    queryFn: () => getJson<ReviewState>(context.api, `/byline/stories/${storyId}/review`),
    enabled: enabled && Number.isSafeInteger(storyId) && storyId > 0,
    refetchInterval: 30_000
  });
}

/**
 * Every review and lifecycle write refreshes the same things: the review, the
 * Story Workspace (its phase and attention), and the shell's Story lists.
 */
export function useReviewRefresh(context: Pick<StoryScreenContext, "storyId" | "shellQueries">) {
  const queries = useQueryClient();
  const storyId = Number(context.storyId);
  return (state?: ReviewState) => {
    if (state) queries.setQueryData(reviewKey(storyId), state);
    void queries.invalidateQueries({ queryKey: reviewKey(storyId) });
    void queries.invalidateQueries({ queryKey: workspaceKey(storyId) });
    void invalidateStoryData(context.shellQueries, storyId);
    if (queries !== context.shellQueries) void invalidateStoryData(queries, storyId);
  };
}

export function problemsOf(error: unknown): SubmissionProblem[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];
  const problems = (error.data as { problems?: unknown }).problems;
  return Array.isArray(problems) ? (problems as SubmissionProblem[]) : [];
}

export function useReviewActions(context: Pick<StoryScreenContext, "api" | "storyId" | "shellQueries">) {
  const storyId = Number(context.storyId);
  const base = `/byline/stories/${storyId}/review`;
  const refresh = useReviewRefresh(context);
  const done = { onSuccess: (state: ReviewState) => refresh(state) };
  return {
    submit: useMutation({ mutationFn: () => postJson<ReviewState>(context.api, `${base}/submit`, {}), ...done }),
    claim: useMutation({ mutationFn: (revision: number) => postJson<ReviewState>(context.api, `${base}/claim`, { expectedRevision: revision }), ...done }),
    comment: useMutation({ mutationFn: (input: { quote?: string; anchor?: unknown; body: string; parent?: number }) => postJson<ReviewState>(context.api, `${base}/comments`, input), ...done }),
    editComment: useMutation({ mutationFn: ({ id, ...input }: { id: number; body?: string; resolved?: boolean }) => patchJson<ReviewState>(context.api, `${base}/comments/${id}`, input), ...done }),
    removeComment: useMutation({ mutationFn: (id: number) => deleteJson<ReviewState>(context.api, `${base}/comments/${id}`, {}), ...done }),
    decide: useMutation({ mutationFn: (input: { decision: "approve" | "request-changes"; summary?: string; expectedRevision: number }) => postJson<ReviewState>(context.api, `${base}/decision`, input), ...done }),
    lifecycle: useMutation({
      mutationFn: (transition: "accept-pitch" | "start-drafting" | "put-on-hold" | "drop" | "resume") => postJson<{ phase: string; label: string }>(context.api, `/byline/stories/${storyId}/lifecycle`, { transition }),
      onSuccess: () => refresh()
    })
  };
}
