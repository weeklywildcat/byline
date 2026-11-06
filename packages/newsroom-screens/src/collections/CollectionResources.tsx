import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResourceIcon } from "../workspace/resource-icon";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { WorkspaceDialog } from "../workspace/dialog-shell";
import { describeEditorialError } from "../editorial/editorial-model";
import { useCollectionHost } from "./collection-host";
import type { CollectionDetail, SharedResource } from "./collection-model";
import { ActionMenu, CollectionEmpty, EntityPicker, StoryOption } from "./collection-ui";

/**
 * Shared reporting material: links and Media files the team uses. Removing
 * one from this Collection only unlinks it here; a resource another
 * Collection uses stays there, and a file stays in Media.
 */
export function CollectionResources({ detail, refresh }: { detail: CollectionDetail; refresh: () => Promise<unknown> }) {
  const host = useCollectionHost();
  const [editing, setEditing] = useState<SharedResource | null>(null);
  const unlink = useMutation({
    mutationFn: (resource: SharedResource) => host.api.unlinkResource(detail.collection.id, resource.id),
    onSuccess: (_result, resource) =>
      toast.success(
        (resource.collectionCount ?? 1) > 1 ? `Removed from this Collection. “${resource.label}” stays in the other Collections that use it.` : "Removed from this Collection.",
        {
          action: {
            label: "Undo",
            onClick: () => {
              void host.api.reuseResource(detail.collection.id, resource.id).then(refresh).catch((e) => toast.error(describeEditorialError(e)));
            },
          },
        },
      ),
    onError: (e) => toast.error(describeEditorialError(e)),
    onSettled: refresh,
  });
  return (
    <>
      {detail.resources.length ? (
        <ItemGroup className="gap-0">
          {detail.resources.map((r) => (
            <Item key={r.id} size="sm" className="min-w-0">
              <ItemMedia variant="icon">
                <ResourceIcon resource={{ ...r, purpose: "other" }} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="truncate">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {r.label}
                    </a>
                  ) : (
                    r.label
                  )}
                </ItemTitle>
                <ItemDescription>
                  {r.kind} · {r.storyIds.length === 1 ? "1 linked story" : `${r.storyIds.length} linked stories`}
                  {(r.collectionCount ?? 1) > 1 ? ` · used in ${r.collectionCount} Collections` : ""}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ActionMenu
                  label={`Actions for ${r.label}`}
                  actions={[
                    ...(r.url ? [{ id: "open", label: "Open", run: () => window.open(r.url, "_blank", "noopener,noreferrer") }] : []),
                    ...(detail.collection.canEdit
                      ? [
                          { id: "stories", label: "Link to stories", run: () => setEditing(r) },
                          { id: "remove", label: "Remove from Collection", run: () => unlink.mutate(r), disabled: unlink.isPending },
                        ]
                      : []),
                  ]}
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <CollectionEmpty title="No shared resources">Add documents, recordings, schedules and reference material for the team.</CollectionEmpty>
      )}
      {editing ? <ResourceLinks key={editing.id} resource={editing} detail={detail} onClose={() => setEditing(null)} refresh={refresh} /> : null}
    </>
  );
}

function ResourceLinks({ resource, detail, onClose, refresh }: { resource: SharedResource; detail: CollectionDetail; onClose: () => void; refresh: () => Promise<unknown> }) {
  const host = useCollectionHost();
  // Stories outside this Collection that the resource also serves stay linked; only this Collection's are edited here.
  const [stories, setStories] = useState(detail.stories.filter((s) => resource.storyIds.includes(s.id)));
  const save = useMutation({
    mutationFn: () =>
      host.api.setResourceStories(detail.collection.id, resource, [
        ...resource.storyIds.filter((id) => !detail.stories.some((s) => s.id === id)),
        ...stories.map((s) => s.id),
      ]),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <WorkspaceDialog
      open
      title="Link to stories"
      description={`Which of this Collection’s stories use “${resource.label}”.`}
      onClose={onClose}
      finalFocus={() => null}
      submitLabel="Save story links"
      pending={save.isPending}
      error={save.isError ? describeEditorialError(save.error) : undefined}
      onSubmit={() => save.mutate()}
    >
      <EntityPicker label="Stories using this resource" items={detail.stories} selected={stories} onChange={setStories} itemLabel={(s) => s.title}>
        {(story) => <StoryOption story={story} />}
      </EntityPicker>
    </WorkspaceDialog>
  );
}
