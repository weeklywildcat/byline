import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeEditorialError } from "../editorial/editorial-model";
import { homeKey } from "../home/home-query";
import {
  collectionKey,
  collectionListKey,
  collectionsKey,
  type CollectionApi,
} from "./collection-api";
import type {
  CollectionDetail,
  CollectionInput,
  CollectionListQuery,
} from "./collection-model";

/** One page of the Collections list, through the shell's one query cache. */
export function useCollectionList(api: CollectionApi, query: Partial<CollectionListQuery>, enabled = true) {
  return useQuery({
    queryKey: collectionListKey(query),
    queryFn: () => api.list(query),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useCollectionDetail(api: CollectionApi, id: number) {
  return useQuery({ queryKey: collectionKey(id), queryFn: () => api.detail(id) });
}

type Refresh = { membership?: boolean; schedule?: boolean; tasks?: boolean };

/**
 * A Collection's mutations. Each refreshes only what it can change: the
 * Collection itself and the list always; Stories when membership changes;
 * Calendar when dated work changes; Home when tasks or interviews change.
 */
export function useCollectionActions(api: CollectionApi, id: number) {
  const client = useQueryClient();
  const refresh = (what: Refresh = {}) =>
    Promise.all([
      client.invalidateQueries({ queryKey: collectionsKey }),
      client.invalidateQueries({ queryKey: collectionKey(id) }),
      ...(what.membership
        ? [
            client.invalidateQueries({ queryKey: ["byline", "story-collections"] }),
            client.invalidateQueries({ queryKey: ["byline", "planning"] }),
          ]
        : []),
      ...(what.schedule ? [client.invalidateQueries({ queryKey: ["byline", "schedule"] })] : []),
      ...(what.tasks || what.schedule ? [client.invalidateQueries({ queryKey: homeKey })] : []),
    ]);
  const error = (e: unknown) => {
    toast.error(describeEditorialError(e, "The change could not be saved. Try again."));
  };
  const update = useMutation({
    mutationFn: (patch: CollectionInput) => api.update(id, patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: collectionKey(id) });
      const previous = client.getQueryData<CollectionDetail>(collectionKey(id));
      // Only plain fields are shown before the server answers; the team and public settings wait for it.
      const shown = Object.fromEntries(
        Object.entries(patch).filter(([key]) => ["status", "type", "startDate", "endDate", "name"].includes(key)),
      );
      client.setQueryData<CollectionDetail>(collectionKey(id), (old) =>
        old ? { ...old, collection: { ...old.collection, ...shown, archived: (shown.status ?? old.collection.status) === "archived" } } : old,
      );
      return previous;
    },
    onError: (e, _patch, previous) => {
      if (previous) client.setQueryData<CollectionDetail>(collectionKey(id), previous);
      error(e);
    },
    onSuccess: (saved, patch, previous) => {
      client.setQueryData<CollectionDetail>(collectionKey(id), (old) => (old ? { ...old, collection: { ...old.collection, ...saved } } : old));
      const keys = Object.keys(patch).filter((key) => !["brief", "expectedBrief", "expectedUpdatedAt", "publicPresentation"].includes(key));
      if (previous && keys.length) {
        const before = previous.collection;
        const undo = Object.fromEntries(
          keys.map((key) => [key, key === "leadId" ? before.lead?.id || 0 : before[key as keyof typeof before]]),
        ) as CollectionInput;
        toast.success(patch.status === "archived" ? "Collection archived" : "Collection updated", {
          action: {
            label: "Undo",
            onClick: () => {
              void api.update(id, undo).then(() => refresh({ schedule: true })).catch(error);
            },
          },
        });
      }
    },
    onSettled: (_saved, _error, patch) => refresh({ schedule: "status" in patch, membership: "publicPresentation" in patch }),
  });
  const membership = useMutation({
    mutationFn: (input: { storyId: number; linked: boolean }) =>
      input.linked ? api.addStory(id, input.storyId) : api.removeStory(id, input.storyId),
    onError: error,
    onSuccess: (_data, input) => {
      toast.success(input.linked ? "Added to Collection" : "Removed from Collection", {
        action: {
          label: "Undo",
          onClick: () => {
            void (input.linked ? api.removeStory(id, input.storyId) : api.addStory(id, input.storyId))
              .then(() => refresh({ membership: true, schedule: true }))
              .catch(error);
          },
        },
      });
    },
    onSettled: () => refresh({ membership: true, schedule: true }),
  });
  const team = useMutation({
    mutationFn: async (input: { add: number[]; remove: number[] }) => {
      for (const userId of input.remove) await api.removeMember(id, userId);
      for (const userId of input.add) await api.addMember(id, userId);
    },
    onError: error,
    onSettled: () => refresh(),
  });
  return { update, membership, team, refresh, error };
}

export type CollectionActions = ReturnType<typeof useCollectionActions>;
