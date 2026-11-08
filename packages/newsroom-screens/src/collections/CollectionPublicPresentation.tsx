import { useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon } from "lucide-react";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Field, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { TextField, TextAreaField, SelectField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { describeEditorialError } from "../editorial/editorial-model";
import { useCollectionHost } from "./collection-host";
import { useCollectionGuard, useGuardedEditor } from "./collection-guard";
import type { CollectionDetail, PublicCoveragePresentation } from "./collection-model";
import type { CollectionActions } from "./collection-query";

const EMPTY: PublicCoveragePresentation = {
  publicEnabled: false,
  publicFormat: "coverage",
  publicTitle: "",
  publicSlug: "",
  publicDescription: "",
  publicOverview: "",
  artworkAttachmentId: 0,
  featuredStoryId: 0,
  storyOrder: [],
};

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

/** The member stories in public order: the saved order first, then any not yet placed. */
export function publicStoryOrder(draft: Pick<PublicCoveragePresentation, "storyOrder" | "featuredStoryId">, storyIds: number[]): number[] {
  const ordered = [...new Set([...draft.storyOrder, ...storyIds])].filter((id) => storyIds.includes(id));
  return draft.featuredStoryId && ordered.includes(draft.featuredStoryId) ? [draft.featuredStoryId, ...ordered.filter((id) => id !== draft.featuredStoryId)] : ordered;
}

/**
 * The Collection's optional public presentation: Newsroom only, public
 * coverage, or a numbered series, at /coverage/<slug>/. Not a publish
 * workflow: nothing changes publicly until Save, and only published stories
 * ever appear. Public wording is separate from the private name and brief;
 * the overview is plain text (paragraphs separated by blank lines).
 */
export function CollectionPublicPresentation({ detail, actions }: { detail: CollectionDetail; actions: CollectionActions }) {
  const host = useCollectionHost();
  const { guard } = useCollectionGuard();
  const c = detail.collection;
  const saved = c.publicPresentation ?? EMPTY;
  const initial = (): PublicCoveragePresentation => ({ ...EMPTY, ...saved, publicFormat: saved.publicFormat === "series" ? "series" : "coverage" });
  const [draft, setDraft] = useState(initial);
  const [base, setBase] = useState(() => JSON.stringify(initial()));
  const [picking, setPicking] = useState(false);
  const storyIds = detail.stories.map((s) => s.id);
  const order = publicStoryOrder(draft, storyIds);
  const dirty = JSON.stringify(draft) !== base;
  useGuardedEditor("public", "the public presentation", () => dirty, () => setDraft(JSON.parse(base) as PublicCoveragePresentation));
  const patch = (value: Partial<PublicCoveragePresentation>) => setDraft((old) => ({ ...old, ...value }));
  const series = draft.publicFormat === "series";
  const canEdit = Boolean(c.canPublish);
  const move = (index: number, direction: number) => {
    const next = [...order];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    patch({ storyOrder: next, featuredStoryId: draft.featuredStoryId && next[0] !== draft.featuredStoryId ? 0 : draft.featuredStoryId });
  };
  const failure = actions.update.isError && actions.update.variables && "publicPresentation" in actions.update.variables ? actions.update.error : null;
  const state = saved.publicEnabled ? (saved.publicFormat === "series" ? "Public series" : "Public coverage") : "Newsroom only";
  return (
    <section aria-labelledby="collection-public" className="flex max-w-3xl min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="collection-public" className="flex items-center gap-2 text-base font-semibold">
            Public presentation <Badge variant={saved.publicEnabled ? "default" : "outline"}>{state}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            {saved.publicEnabled && saved.publicSlug
              ? `/coverage/${saved.publicSlug}/ · only published stories appear.`
              : "Readers see nothing of this Collection. Present it as public coverage or a series when it’s ready."}
          </p>
        </div>
        {c.publicUrl ? (
          <a href={c.publicUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View coverage ↗
          </a>
        ) : null}
      </header>
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">An editor manages the public presentation.</p>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const next = { ...draft, storyOrder: order };
            actions.update.mutate({ publicPresentation: next }, { onSuccess: (result) => {
              const stored = { ...EMPTY, ...(result.publicPresentation ?? next) };
              setDraft(stored);
              setBase(JSON.stringify(stored));
            } });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Visibility"
              value={draft.publicEnabled ? "public" : "private"}
              options={[
                { value: "private", label: "Newsroom only" },
                { value: "public", label: "Public" },
              ]}
              onChange={(v) => patch({ publicEnabled: v === "public", publicTitle: draft.publicTitle || c.name, publicSlug: draft.publicSlug || slugify(draft.publicTitle || c.name) })}
            />
            <SelectField
              label="Format"
              hint={series ? "Stories are numbered Part 1, Part 2… and link to each other in order." : "Readers follow developing reporting on one page."}
              value={series ? "series" : "coverage"}
              options={[
                { value: "coverage", label: "Ongoing coverage" },
                { value: "series", label: "Numbered series" },
              ]}
              onChange={(v) => patch({ publicFormat: v === "series" ? "series" : "coverage" })}
            />
          </div>
          <TextField label="Public title" hint="What readers see; it can differ from the Collection’s name." value={draft.publicTitle} onChange={(publicTitle) => patch({ publicTitle })} maxLength={240} />
          <TextField label="URL slug" hint={`/coverage/${draft.publicSlug || "your-slug"}/`} value={draft.publicSlug} onChange={(publicSlug) => patch({ publicSlug: slugify(publicSlug) || publicSlug.toLowerCase() })} maxLength={120} />
          <TextAreaField label="Short description" value={draft.publicDescription} onChange={(publicDescription) => patch({ publicDescription })} maxLength={320} />
          <TextAreaField label="Public overview" hint="Plain text. Separate paragraphs with a blank line." value={draft.publicOverview} onChange={(publicOverview) => patch({ publicOverview })} maxLength={10000} rows={6} />
          <Field>
            <FieldLabel>Artwork</FieldLabel>
            <div className="flex flex-wrap items-center gap-3">
              {draft.artworkAttachmentId ? (
                draft.artworkPreviewUrl ? (
                  <img src={draft.artworkPreviewUrl} alt="" className="size-16 rounded-md border object-cover" />
                ) : (
                  <span className="flex size-16 items-center justify-center rounded-md border text-muted-foreground"><ImageIcon aria-hidden="true" /></span>
                )
              ) : (
                <span className="text-sm text-muted-foreground">No artwork</span>
              )}
              {host.media?.available() ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={picking}
                  onClick={async () => {
                    setPicking(true);
                    try {
                      const files = await host.media!.pick("photo", { title: "Choose artwork", buttonLabel: "Use as artwork", multiple: false });
                      if (files[0]) patch({ artworkAttachmentId: files[0].id, artworkPreviewUrl: files[0].previewUrl });
                    } finally {
                      setPicking(false);
                    }
                  }}
                >
                  {draft.artworkAttachmentId ? "Change artwork" : "Choose artwork"}
                </Button>
              ) : null}
              {draft.artworkAttachmentId ? (
                <Button variant="ghost" size="sm" type="button" onClick={() => patch({ artworkAttachmentId: 0, artworkPreviewUrl: null })}>
                  Remove artwork
                </Button>
              ) : null}
            </div>
          </Field>
          <SelectField
            label={series ? "Part 1 (lead story)" : "Lead story"}
            value={String(draft.featuredStoryId)}
            options={[{ value: "0", label: "None: use the order below" }, ...detail.stories.map((s) => ({ value: String(s.id), label: s.title }))]}
            onChange={(v) => patch({ featuredStoryId: Number(v) })}
          />
          <div>
            <h3 className="mb-1 text-sm font-medium">{series ? "Part order" : "Public story order"}</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              {series ? "Parts are numbered in this order. Unpublished stories keep their place but are skipped until they publish." : "The lead story comes first. Unpublished stories stay private until they publish."}
            </p>
            {order.length ? (
              <ItemGroup className="gap-0 rounded-lg border" aria-label={series ? "Part order" : "Public story order"}>
                {order.map((id, index) => {
                  const story = detail.stories.find((s) => s.id === id)!;
                  const published = story.publicationState.isPublished;
                  return (
                    <Item key={id} size="sm">
                      <ItemContent>
                        <ItemTitle className="break-words">
                          {series ? <span className="mr-1 text-muted-foreground tabular-nums">Part {index + 1}</span> : index === 0 && draft.featuredStoryId === id ? <Badge variant="secondary" className="mr-1">Lead</Badge> : null}
                          {story.title}
                        </ItemTitle>
                        {!published ? <ItemDescription>Not published yet: skipped publicly</ItemDescription> : null}
                      </ItemContent>
                      <ItemActions>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${story.title} up`} disabled={!index} onClick={() => move(index, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${story.title} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}>
                          <ArrowDown />
                        </Button>
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            ) : (
              <p className="text-sm text-muted-foreground">Add stories to the Collection to order them here.</p>
            )}
          </div>
          {failure ? <InlineAlert>{describeEditorialError(failure, "The public presentation could not be saved.")}</InlineAlert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={!dirty || actions.update.isPending} onClick={() => guard(() => undefined)}>
              Discard changes
            </Button>
            <Button type="submit" disabled={!dirty || actions.update.isPending}>
              {actions.update.isPending ? "Saving…" : "Save public presentation"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
