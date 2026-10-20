/**
 * Planning's server state. TanStack Query owns every fetched collection; the
 * components keep only what is ephemeral (selected view, open menus, drag state).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { __, sprintf } from "@wordpress/i18n";
import { announce } from "@atlaskit/pragmatic-drag-and-drop-live-region";
import { toast } from "sonner";
import { decodeEntities } from "../admin-ui/lib/text";
import { describeEditorialError } from "../editorial/editorial-model";
import { invalidateStoryData, planningKey, planningRootKey } from "../story/story-query";
import type { PlanningFetchers } from "./planning-api";
import { planningFilterParams } from "./planning-api";
import {
  applyPlanningMove,
  describePlanningError,
  replacePlanningStory,
  type PlanningFilters,
  type PlanningResponse,
  type PlanningStory,
  type PlanningWorkflowStatus
} from "./planning-model";

export function usePlanningStories(fetchers: PlanningFetchers, filters: PlanningFilters) {
  return useQuery({
    queryKey: planningKey(planningFilterParams(filters)),
    queryFn: () => fetchers.getPlanning(filters),
    // Typing in search or changing a filter keeps the current stories on screen until the new ones arrive.
    placeholderData: keepPreviousData,
    // WordPress texturizes headlines into HTML entities; every Planning view shows them as the characters they are.
    select: (data) => ({ ...data, stories: data.stories.map((story) => ({ ...story, title: decodeEntities(story.title) })) })
  });
}

export type OptionalQuery<T> = { data: T | undefined; error: string | null; isLoading: boolean; available: boolean; refetch: () => void };

/**
 * Secondary destinations share one failure policy: unavailable data is a
 * visible message with a retry, never a reason for anything else to fail.
 */
export function useOptionalQuery<T>(key: QueryKey, fetcher: (() => Promise<T>) | undefined, label: string): OptionalQuery<T> {
  const query = useQuery({ queryKey: key, queryFn: () => fetcher!(), enabled: Boolean(fetcher), retry: false });
  return {
    data: query.data,
    error: !fetcher ? __("This isn't available in this install.", "weekly-wildcat-headless") : query.isError ? describePlanningError(query.error, `${label} is unavailable right now.`) : null,
    isLoading: Boolean(fetcher) && query.isPending,
    available: Boolean(fetcher) && !query.isError,
    refetch: () => void query.refetch()
  };
}

type InlineUpdateVariables = {
  story: PlanningStory;
  changes: Record<string, unknown>;
  optimistic: PlanningStory;
  label: string;
};

/**
 * Fast List edits use the same story endpoint as the full editor, but stay
 * quiet when they succeed. The visible cell updates immediately; failures
 * restore only the optimistic copy that this edit wrote.
 */
export function useUpdatePlanningStory(fetchers: PlanningFetchers) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ story, changes }: InlineUpdateVariables) => {
      if (!fetchers.updateStory) throw new Error(__("Quick edits are not available in this install.", "weekly-wildcat-headless"));
      return fetchers.updateStory(story.id, changes);
    },
    onMutate: async ({ story, optimistic }) => {
      await client.cancelQueries({ queryKey: planningRootKey });
      client.setQueriesData<PlanningResponse>({ queryKey: planningRootKey }, (old) => old?.stories
        ? { ...old, stories: replacePlanningStory(old.stories, story.id, optimistic) }
        : old);
      return { optimistic };
    },
    onError: (error, { story, label }, context) => {
      if (context) {
        client.setQueriesData<PlanningResponse>({ queryKey: planningRootKey }, (old) => old?.stories
          ? { ...old, stories: replacePlanningStory(old.stories, story.id, story, context.optimistic) }
          : old);
      }
      const message = describeEditorialError(error, sprintf(__("%s could not be saved. The previous value was restored.", "weekly-wildcat-headless"), label));
      toast.error(message);
      announce(`${story.title || __("Story", "weekly-wildcat-headless")}: ${message}`);
    },
    onSuccess: (_result, { story, label }) => {
      announce(`${story.title || __("Untitled story", "weekly-wildcat-headless")}: ${label} updated.`);
    },
    onSettled: (_data, _error, variables) => { void invalidateStoryData(client, variables.story.id); }
  });

  return {
    update: (story: PlanningStory, changes: Record<string, unknown>, patch: Partial<PlanningStory>, label: string) => {
      const optimistic = { ...story, ...patch };
      return mutation.mutateAsync({ story, changes, optimistic, label }).catch(() => undefined);
    },
    updatingStoryId: mutation.isPending ? mutation.variables?.story.id ?? null : null,
    available: Boolean(fetchers.updateStory)
  };
}

type MoveVariables = { story: PlanningStory; status: string };

/**
 * The one workflow move. Dragging a card and choosing "Move to" both call
 * `move`; it updates every cached collection at once, saves, rolls back on
 * failure, and announces the result to assistive technology.
 */
export function useMoveStory(fetchers: PlanningFetchers, statuses: PlanningWorkflowStatus[]) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ story, status }: MoveVariables) => {
      if (!fetchers.moveStory) throw new Error(__("Workflow moves are not available in this install.", "weekly-wildcat-headless"));
      return fetchers.moveStory(story.id, status);
    },
    onMutate: async ({ story, status }) => {
      await client.cancelQueries({ queryKey: planningRootKey });
      const result = applyPlanningMove(story, status, statuses);
      if (!result.moved) throw new Error(result.error || __("That story cannot be moved.", "weekly-wildcat-headless"));
      client.setQueriesData<PlanningResponse>({ queryKey: planningRootKey }, (old) => old?.stories ? { ...old, stories: replacePlanningStory(old.stories, story.id, { ...result.story }) } : old);
      return { optimistic: result.story };
    },
    onError: (error, { story }, context) => {
      // Restore only this story, and only if nothing newer replaced the optimistic copy.
      if (context) client.setQueriesData<PlanningResponse>({ queryKey: planningRootKey }, (old) => old?.stories ? { ...old, stories: old.stories.map((item) => item.id === story.id && item.workflow.id === context.optimistic.workflow.id ? story : item) } : old);
      const message = describeEditorialError(error, __("The workflow move could not be saved. The previous stage was restored.", "weekly-wildcat-headless"));
      toast.error(message);
      announce(`${story.title || __("Story", "weekly-wildcat-headless")}: ${message}`);
    },
    onSuccess: (_result, { story, status }) => {
      const to = statuses.find((item) => item.id === status)?.label || status;
      const message = `${story.title || __("Untitled story", "weekly-wildcat-headless")} ${__("moved from", "weekly-wildcat-headless")} ${story.workflow.label} ${__("to", "weekly-wildcat-headless")} ${to}.`;
      announce(message);
    },
    onSettled: (_data, _error, variables) => { void invalidateStoryData(client, variables.story.id); }
  });
  return {
    move: (story: PlanningStory, status: string) => mutation.mutateAsync({ story, status }).catch(() => undefined),
    movingStoryId: mutation.isPending ? mutation.variables?.story.id ?? null : null
  };
}
