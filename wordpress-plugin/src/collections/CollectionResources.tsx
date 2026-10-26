import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ResourceIcon } from "../admin-ui/components/resource-icon";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "../admin-ui/ui/item";
import { WorkspaceDialog } from "../workspace/dialog-shell";
import { describeEditorialError } from "../editorial/editorial-model";
import type { CollectionApi } from "./collection-api";
import {
  edgeChanges,
  type CollectionDetail,
  type SharedResource,
} from "./collection-model";
import {
  ActionMenu,
  CollectionEmpty,
  EntityPicker,
  StoryOption,
} from "./collection-ui";
export function CollectionResources({
  detail,
  api,
  refresh,
  onRemove,
}: {
  detail: CollectionDetail;
  api: CollectionApi;
  refresh: () => Promise<unknown>;
  onRemove: (id: number) => void;
}) {
  const [editing, setEditing] = useState<SharedResource | null>(null);
  return (
    <>
      {detail.resources.length ? (
        <ItemGroup className="gap-0">
          {detail.resources.map((r) => (
            <div key={r.id} className="flex items-center gap-1">
              <Item
                size="sm"
                className="min-w-0 flex-1"
                render={
                  <a href={r.url} target="_blank" rel="noopener noreferrer" />
                }
              >
                <ItemMedia variant="icon">
                  <ResourceIcon resource={{ ...r, purpose: "other" }} />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{r.label}</ItemTitle>
                  <ItemDescription>
                    {r.kind} · {r.storyIds.length} linked stories
                  </ItemDescription>
                </ItemContent>
              </Item>
              {detail.collection.canEdit ? (
                <ItemActions>
                  <ActionMenu
                    label={`Actions for ${r.label}`}
                    actions={[
                      {
                        id: "stories",
                        label: "Link to stories",
                        run: () => setEditing(r),
                      },
                      {
                        id: "remove",
                        label: "Remove reference",
                        run: () => onRemove(r.id),
                      },
                    ]}
                  />
                </ItemActions>
              ) : null}
            </div>
          ))}
        </ItemGroup>
      ) : (
        <CollectionEmpty title="No shared resources">
          Add documents, media, schedules, and reference material for the team.
        </CollectionEmpty>
      )}
      {editing ? (
        <ResourceLinks
          key={editing.id}
          resource={editing}
          detail={detail}
          api={api}
          onClose={() => setEditing(null)}
          refresh={refresh}
        />
      ) : null}
    </>
  );
}
function ResourceLinks({
  resource,
  detail,
  api,
  onClose,
  refresh,
}: {
  resource: SharedResource;
  detail: CollectionDetail;
  api: CollectionApi;
  onClose: () => void;
  refresh: () => Promise<unknown>;
}) {
  const [stories, setStories] = useState(
    detail.stories.filter((s) => resource.storyIds.includes(s.id)),
  );
  const save = useMutation({
    mutationFn: async () => {
      for (const change of edgeChanges(
        resource.storyIds,
        stories.map((s) => s.id),
      ))
        await api.resourceStory(
          detail.collection.id,
          resource.id,
          change.target,
          change.linked,
        );
    },
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  return (
    <WorkspaceDialog
      open
      title="Link shared resource"
      description={resource.label}
      onClose={onClose}
      finalFocus={() => null}
      submitLabel="Save story links"
      pending={save.isPending}
      error={save.isError ? describeEditorialError(save.error) : undefined}
      onSubmit={() => save.mutate()}
    >
      <EntityPicker
        label="Stories using this resource"
        items={detail.stories}
        selected={stories}
        onChange={setStories}
        itemLabel={(s) => s.title}
      >
        {(story) => <StoryOption story={story} />}
      </EntityPicker>
    </WorkspaceDialog>
  );
}
