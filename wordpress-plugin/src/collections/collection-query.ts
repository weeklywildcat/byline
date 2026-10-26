import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeEditorialError } from "../editorial/editorial-model";
import type { CollectionApi } from "./collection-api";
import { collectionsKey, collectionKey } from "./collection-api";
import type { CollectionDetail, CollectionInput } from "./collection-model";
import { homeKey } from "../home/home-query";
export function useCollectionActions(api: CollectionApi, id: number) {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: collectionsKey }),
      client.invalidateQueries({ queryKey: collectionKey(id) }),
      client.invalidateQueries({ queryKey: ["byline", "story-collections"] }),
      client.invalidateQueries({ queryKey: homeKey }),
      client.invalidateQueries({ queryKey: ["byline", "schedule"] }),
    ]);
  const error = (e: unknown) => {
    toast.error(
      describeEditorialError(e, "The change could not be saved. Try again."),
    );
  };
  const update = useMutation({
    mutationFn: (patch: CollectionInput) => api.save(patch, id),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: collectionKey(id) });
      const previous = client.getQueryData<CollectionDetail>(collectionKey(id));
      client.setQueryData<CollectionDetail>(collectionKey(id), (old) =>
        old ? { ...old, collection: { ...old.collection, ...patch } } : old,
      );
      return previous;
    },
    onError: (e, _input, previous) => {
      if (previous)
        client.setQueryData<CollectionDetail>(collectionKey(id), (current) => {
          if (!current) return current;
          const collection = { ...current.collection };
          for (const key of Object.keys(_input) as (keyof CollectionInput)[]) {
            if (key === "leadId" || key === "expectedBrief") continue;
            if (collection[key] === _input[key])
              Object.assign(collection, { [key]: previous.collection[key] });
          }
          return { ...current, collection };
        });
      error(e);
    },
    onSuccess: (_saved, patch, previous) => {
      if (
        previous &&
        Object.keys(patch).some(
          (key) => key !== "brief" && key !== "expectedBrief",
        )
      ) {
        const before = previous.collection;
        const undo = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            key === "leadId"
              ? before.lead?.id || 0
              : before[key as keyof typeof before],
          ]),
        ) as CollectionInput;
        toast.success(
          patch.status === "archived"
            ? "Collection archived"
            : "Collection updated",
          {
            action: {
              label: "Undo",
              onClick: () => {
                void api.save(undo, id).then(refresh).catch(error);
              },
            },
          },
        );
      }
    },
    onSettled: refresh,
  });
  const link = useMutation({
    mutationFn: (input: {
      kind: string;
      target: number;
      linked: boolean;
      interview?: number;
    }) => api.link(id, input.kind, input.target, input.linked, input.interview),
    onError: error,
    onSuccess: (_data, input) => {
      toast.success(
        input.linked ? "Added to Collection" : "Removed from Collection",
        {
          action: {
            label: "Undo",
            onClick: () => {
              void api
                .link(
                  id,
                  input.kind,
                  input.target,
                  !input.linked,
                  input.interview,
                )
                .then(refresh)
                .catch(error);
            },
          },
        },
      );
    },
    onSettled: refresh,
  });
  return { update, link, refresh, error };
}

export type ReturnTypeOfCollectionActions = ReturnType<
  typeof useCollectionActions
>;
