import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "../admin-ui/ui/button";
import { Badge } from "../admin-ui/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "../admin-ui/ui/item";
import {
  TextField,
  TextAreaField,
  SelectField,
} from "../admin-ui/components/form-fields";
import { WorkspaceDialog } from "../workspace/dialog-shell";
import {
  mediaLibraryAvailable,
  pickFromMediaLibrary,
} from "../workspace/media-library";
import { describeEditorialError } from "../editorial/editorial-model";
import type {
  CollectionDetail,
  PublicCoveragePresentation,
} from "./collection-model";
import type { ReturnTypeOfCollectionActions } from "./collection-query";

export function CollectionPublicCoverage({
  detail,
  actions,
}: {
  detail: CollectionDetail;
  actions: ReturnTypeOfCollectionActions;
}) {
  const c = detail.collection;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PublicCoveragePresentation | null>(null);
  const enabled = Boolean(c.publicPresentation?.publicEnabled);
  function edit() {
    const initial = c.publicPresentation ?? {
      publicEnabled: false,
      publicTitle: c.name,
      publicSlug: "",
      publicDescription: "",
      publicOverview: "",
      artworkAttachmentId: 0,
      featuredStoryId: 0,
      storyOrder: [],
    };
    setDraft({
      ...initial,
      publicEnabled: true,
      publicTitle: initial.publicTitle || c.name,
    });
    setEditing(true);
  }
  const patch = (value: Partial<PublicCoveragePresentation>) =>
    setDraft((old) => (old ? { ...old, ...value } : old));
  const order = draft
    ? [
        ...new Set([...draft.storyOrder, ...detail.stories.map((s) => s.id)]),
      ].filter((id) => detail.stories.some((s) => s.id === id))
    : [];
  function move(index: number, direction: number) {
    const next = [...order];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    patch({ storyOrder: next });
  }
  return (
    <section aria-label="Public coverage">
      <h2 className="mb-2 text-sm font-semibold">Public coverage</h2>
      <Item size="sm" variant="outline">
        <ItemContent>
          <ItemTitle>
            {enabled
              ? c.publicPresentation?.publicTitle
              : "Newsroom-only Collection"}{" "}
            <Badge variant="outline">{enabled ? "Public" : "Private"}</Badge>
          </ItemTitle>
          <ItemDescription>
            {enabled
              ? "Published stories appear on the public coverage page."
              : "Coordinate reporting here. Publish a reader-facing coverage page when ready."}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="flex-wrap">
          {enabled && c.publicUrl ? (
            <Button
              variant="ghost"
              size="sm"
              render={
                <a
                  href={c.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              View coverage ↗
            </Button>
          ) : null}
          {c.canEdit && c.canPublish ? (
            <Button variant="outline" size="sm" onClick={edit}>
              {enabled ? "Edit public coverage" : "Publish as coverage"}
            </Button>
          ) : null}
        </ItemActions>
      </Item>
      {editing && draft ? (
        <WorkspaceDialog
          open
          title="Public coverage"
          description="Public wording is independent from the internal name and brief. Only published stories appear on the website."
          onClose={() => setEditing(false)}
          finalFocus={() => null}
          submitLabel="Save public coverage"
          pending={actions.update.isPending}
          error={
            actions.update.isError
              ? describeEditorialError(actions.update.error)
              : undefined
          }
          onSubmit={() =>
            actions.update.mutate(
              { publicPresentation: { ...draft, storyOrder: order } },
              { onSuccess: () => setEditing(false) },
            )
          }
        >
          <SelectField
            label="Visibility"
            value={draft.publicEnabled ? "public" : "private"}
            options={[
              { value: "private", label: "Newsroom only" },
              { value: "public", label: "Public coverage" },
            ]}
            onChange={(v) => patch({ publicEnabled: v === "public" })}
          />
          <TextField
            label="Public title"
            value={draft.publicTitle}
            onChange={(publicTitle) => patch({ publicTitle })}
            maxLength={240}
          />
          <TextField
            label="URL slug"
            hint="/coverage/your-slug/"
            value={draft.publicSlug}
            onChange={(publicSlug) => patch({ publicSlug })}
            maxLength={200}
          />
          <TextAreaField
            label="Short description / dek"
            value={draft.publicDescription}
            onChange={(publicDescription) => patch({ publicDescription })}
            maxLength={320}
          />
          <TextAreaField
            label="Public overview"
            hint="Basic HTML is supported."
            value={draft.publicOverview}
            onChange={(publicOverview) => patch({ publicOverview })}
            maxLength={10000}
            rows={5}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              {draft.artworkAttachmentId
                ? `Artwork #${draft.artworkAttachmentId}`
                : "No artwork"}
            </span>
            {mediaLibraryAvailable() ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void pickFromMediaLibrary("photo", {
                    title: "Coverage artwork",
                    buttonLabel: "Use artwork",
                    multiple: false,
                  }).then((items) => {
                    if (items[0]) patch({ artworkAttachmentId: items[0].id });
                  });
                }}
              >
                Choose artwork
              </Button>
            ) : null}
            {draft.artworkAttachmentId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch({ artworkAttachmentId: 0 })}
              >
                Remove artwork
              </Button>
            ) : null}
          </div>
          <SelectField
            label="Featured / lead story"
            value={String(draft.featuredStoryId)}
            options={[
              { value: "0", label: "None" },
              ...detail.stories.map((s) => ({
                value: String(s.id),
                label: s.title,
              })),
            ]}
            onChange={(v) => patch({ featuredStoryId: Number(v) })}
          />
          <div>
            <h3 className="mb-2 text-sm font-medium">Public story order</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              The lead story appears first. Unpublished stories remain private.
            </p>
            <ItemGroup className="gap-0 rounded-lg border">
              {order.map((id, index) => {
                const story = detail.stories.find((s) => s.id === id)!;
                return (
                  <Item key={id} size="sm">
                    <ItemContent>
                      <ItemTitle className="break-words">
                        {story.title}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move ${story.title} up`}
                        disabled={!index}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move ${story.title} down`}
                        disabled={index === order.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </div>
        </WorkspaceDialog>
      ) : null}
    </section>
  );
}
